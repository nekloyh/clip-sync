'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Attachment, Room, RoomCapabilities } from '@/lib/types';
import { EditorHeader } from './EditorHeader';
import { StatusRail } from './StatusRail';
import { AttachmentGrid } from './AttachmentGrid';
import { PinModal } from './PinModal';
import { OwnerNotice } from './OwnerNotice';
import { useToast } from '@/components/ui/Toast';
import { UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  failureFromResponse,
  failureFromThrown,
  fetchWithTimeout,
  type RequestFailure,
} from '@/lib/request-failure';
import {
  createSaveQueue,
  saveRequestInit,
  type SaveQueue,
  type SaveSender,
} from '@/lib/save-queue';
import { createUnsentEdit } from '@/lib/unsent-edit';
import type { PendingUpload } from './AttachmentGrid';

interface TextEditorProps {
  initialRoom: Room;
  initialAttachments: Attachment[];
  /** Server's verdict on what this visitor may do. Presentation only. */
  initialCapabilities: RoomCapabilities;
  /** Set on the first load after creation, to explain what ownership means. */
  justCreated?: boolean;
  slug: string;
}

const MAX_CHARS = 100000;
const SAVE_DEBOUNCE_MS = 500;
const SAVE_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

export function TextEditor({
  initialRoom,
  initialAttachments,
  initialCapabilities,
  justCreated = false,
  slug,
}: TextEditorProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // Unique client ID per tab session to avoid self-echo loops
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current) {
    clientIdRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);
  }

  const [content, setContent] = useState<string>(initialRoom.content || '');
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [hasPin, setHasPin] = useState<boolean>(initialRoom.hasPin);
  // Mirrors the API's answer so the chrome matches reality after a re-sync.
  // Every action these flags reveal is re-authorized server-side anyway.
  const [capabilities, setCapabilities] = useState<RoomCapabilities>(initialCapabilities);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'idle' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  // One entry per file the person has handed over but the server has not
  // confirmed. A file only becomes an `Attachment` - and only then looks
  // finished - once a 200 comes back with a row id, so nothing in the grid
  // claims to be stored before it is.
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  /**
   * The text a save could not deliver, kept so it is never lost.
   *
   * Autosave used to fail into a toast: the buffer on screen was ahead of the
   * server, nothing said which parts had landed, and closing the tab discarded
   * the difference silently. Holding the exact text that failed - and offering
   * a button that resends it - is what makes "saved" mean something.
   */
  const [saveFailure, setSaveFailure] = useState<RequestFailure | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The text a debounced save is holding but has not sent yet, so unmount can
  // still flush it.
  const pendingContentRef = useRef<string | null>(null);
  const lastUpdatedAtRef = useRef<string>(initialRoom.updated_at || new Date(0).toISOString());
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dragDepthRef = useRef(0);
  /**
   * What this browser still owes the server: the newest text, and whether any
   * of it is unsent. Kept in one place because the two used to be two refs that
   * drifted apart — see src/lib/unsent-edit.ts for the edit that got lost.
   */
  const unsentRef = useRef(createUnsentEdit(initialRoom.content || ''));
  const uploadSeqRef = useRef(0);

  const formatTime = (isoString?: string) => {
    try {
      const date = isoString ? new Date(isoString) : new Date();
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  /** Applies remote content while keeping the caret roughly where it was. */
  const applyRemoteContent = useCallback((next: string, updatedAt: string) => {
    lastUpdatedAtRef.current = updatedAt;
    // Adopting the server's text also disarms the resend: this browser's
    // unsent edit is gone from the screen, and resending what replaced it would
    // send the room backwards. See src/lib/unsent-edit.ts.
    unsentRef.current.superseded(next);
    setSaveFailure(null);

    const textarea = textareaRef.current;
    const isFocused = textarea != null && textarea === document.activeElement;
    const start = isFocused ? textarea!.selectionStart : null;
    const end = isFocused ? textarea!.selectionEnd : null;

    setContent(next);

    if (isFocused && start !== null && end !== null) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const max = next.length;
        el.setSelectionRange(Math.min(start, max), Math.min(end, max));
      });
    }
  }, []);

  /**
   * Pulls authoritative state from the API. Realtime only ever carries a
   * "something changed" ping — the content itself is never broadcast, because
   * anyone who knows the slug can join the channel, PIN or not.
   */
  const syncFromServer = useCallback(
    async (options: { force?: boolean } = {}) => {
      try {
        const res = await fetch(`/api/rooms/${slug}`, { cache: 'no-store' });
        if (res.status === 401) {
          router.refresh(); // unlock cookie expired — fall back to the lock screen
          return;
        }
        if (!res.ok) return;

        const data = await res.json();
        if (!data?.room) return;

        setAttachments(data.attachments ?? []);
        setHasPin(!!data.room.hasPin);
        if (data.capabilities) setCapabilities(data.capabilities);

        const remoteTime = new Date(data.room.updated_at).getTime();
        const localTime = new Date(lastUpdatedAtRef.current).getTime();
        const hasPendingEdit = saveTimeoutRef.current !== null;

        if (options.force || (remoteTime > localTime && !hasPendingEdit)) {
          applyRemoteContent(data.room.content ?? '', data.room.updated_at);
          setLastSavedAt(formatTime(data.room.updated_at));
          setSaveStatus('saved');
        }
      } catch {
        // Offline or transient — the next ping or reconnect retries.
      }
    },
    [slug, router, applyRemoteContent]
  );

  /** One save, start to finish. Never called concurrently — see the queue below. */
  const sendSave = useCallback(
    async (textToSave: string) => {
      // This text is now in a request rather than waiting for one, so the
      // teardown flush no longer owns it. Cleared here rather than at submit
      // time so the window between the two belongs to the flush.
      if (pendingContentRef.current === textToSave) pendingContentRef.current = null;
      setSaveStatus('saving');

      try {
        const res = await fetchWithTimeout(
          `/api/rooms/${slug}/save`,
          saveRequestInit(textToSave),
          SAVE_TIMEOUT_MS
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const failure = failureFromResponse(res.status, data, res.headers.get('Retry-After'));
          // Marks that something is unsaved. The retry sends the newest text
          // rather than this copy, so what matters here is the flag, not the
          // string — but keeping the string makes the two paths readable.
          unsentRef.current.failed();
          setSaveFailure(failure);
          setSaveStatus('error');
          return;
        }

        unsentRef.current.saved();
        setSaveFailure(null);

        const newUpdatedAt = data?.updated_at || new Date().toISOString();
        lastUpdatedAtRef.current = newUpdatedAt;
        setLastSavedAt(formatTime(newUpdatedAt));
        setSaveStatus('saved');

        channelRef.current?.send({
          type: 'broadcast',
          event: 'room_changed',
          payload: { clientId: clientIdRef.current, updated_at: newUpdatedAt },
        });
      } catch (err) {
        unsentRef.current.failed();
        setSaveFailure(
          failureFromThrown(err, typeof navigator === 'undefined' ? true : navigator.onLine)
        );
        setSaveStatus('error');
      }
    },
    [slug]
  );

  /**
   * The queue is created once and reads the current sender through a ref, so
   * the ordering guarantee survives a re-render without the queue being rebuilt
   * mid-flight.
   */
  const senderRef = useRef<SaveSender>(async () => {});
  useEffect(() => {
    senderRef.current = sendSave;
  }, [sendSave]);

  const queueRef = useRef<SaveQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue((text) => senderRef.current(text));
  }

  /**
   * Hand text to the queue.
   *
   * Saves are serialised rather than fired as they are produced. The server
   * keeps whichever write arrives last, so two overlapping requests mean the
   * older text can land second and silently undo the newer one — which is
   * exactly what a retry firing next to a debounced save used to do.
   */
  const performSave = useCallback((textToSave: string) => {
    // Deliberately not cleared here. Text handed to the queue is not text that
    // has been sent, and until a request is actually built for it, it is what a
    // teardown has to flush.
    // `sendSave` reports failure through component state rather than by
    // throwing, so this catch is only here to keep a future sender that does
    // throw from surfacing as an unhandled rejection.
    queueRef.current?.submit(textToSave).catch(() => {});
  }, []);

  /** Resend after a failure — always the newest text, never the one that failed. */
  const retrySave = useCallback(() => {
    const text = unsentRef.current.resend;
    if (text === null) return;
    performSave(text);
  }, [performSave]);

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      pendingContentRef.current = value;
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        performSave(value);
      }, SAVE_DEBOUNCE_MS);
    },
    [performSave]
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Truncate rather than drop the edit: rejecting the whole change made a
    // large paste silently vanish.
    const raw = e.target.value;
    const val = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw;
    if (val !== raw) {
      showToast(`Đã cắt bớt nội dung vượt quá ${MAX_CHARS.toLocaleString()} ký tự`, 'error');
    }

    unsentRef.current.edited(val);
    setContent(val);
    setSaveStatus('saving');
    scheduleSave(val);
  };

  /**
   * Flush the debounce window on unmount, and only on unmount.
   *
   * This covers in-app navigation and nothing else: React runs cleanups when a
   * component unmounts, and closing a tab or following a link to another origin
   * unmounts nothing. So someone who pastes a log and shuts the tab inside the
   * debounce window still loses it — a real bug (GAP-4), deliberately not fixed
   * here.
   *
   * The obvious fix, a `pagehide` listener firing the same keepalive request,
   * was rejected: it would ship whatever is in the buffer to the server at the
   * one moment the person is gone and cannot confirm anything, and PLAN.md
   * Phase B is being built to make un-reviewed content reaching the server
   * impossible. Widening that path a fortnight before inverting it is work in
   * the wrong direction. The fix belongs in Phase B, where losing an
   * unconfirmed draft to local storage is the correct behaviour rather than a
   * silent upload. See FREEZE_NOTES.md on the legacy branch.
   */
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Keyed on there being something unsent, not on the timer still running.
      // Those came apart once saves were serialised: a debounce that fires
      // while a request is in flight hands its text to the queue and clears the
      // timer, so a flush that asked about the timer would find nothing and
      // return, with the text still waiting behind the in-flight save.
      const pending = pendingContentRef.current;
      pendingContentRef.current = null;
      if (pending === null) return;

      void fetch(`/api/rooms/${slug}/save`, saveRequestInit(pending, true)).catch(() => {
        // Nothing left to tell: the component is gone.
      });
    };
  }, [slug]);

  // Realtime: presence + change pings only.
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`room:${slug}`, {
      config: { presence: { key: clientIdRef.current } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'room_changed' }, (response: { payload?: unknown }) => {
      const payload = response.payload as { clientId?: string } | undefined;
      if (!payload || payload.clientId === clientIdRef.current) return;
      void syncFromServer();
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setOnlineCount(Math.max(1, Object.keys(channel.presenceState()).length));
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        void channel.track({
          clientId: clientIdRef.current,
          onlineAt: new Date().toISOString(),
        });
        // Covers reconnects: pings sent while this tab was offline are lost, so
        // re-read state every time the subscription comes up.
        void syncFromServer();
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [slug, syncFromServer]);

  /**
   * Track connectivity, and resend a failed save when the network returns.
   *
   * The `online` event is the one moment where a retry is known to be worth
   * attempting, so taking it removes the most common reason a person would have
   * had to press the button themselves. Uploads are deliberately *not*
   * auto-retried: a file is large, the person may have moved on, and silently
   * re-sending several megabytes on a newly-recovered (possibly metered)
   * connection is a decision that should stay theirs.
   */
  useEffect(() => {
    const update = () => {
      const online = navigator.onLine;
      setIsOffline(!online);
      if (online && unsentRef.current.resend !== null) retrySave();
    };

    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [retrySave]);

  // Refresh when the tab regains focus — a phone waking from sleep drops the
  // websocket without a reconnect event the app can see.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncFromServer();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncFromServer]);

  const notifyPeers = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_changed',
      payload: { clientId: clientIdRef.current, updated_at: new Date().toISOString() },
    });
  }, []);

  /**
   * Send one file, tracked as its own pending entry from the moment it is
   * accepted until the server confirms it.
   *
   * `existingId` is what makes retry a retry rather than a second upload: the
   * same entry goes back to `uploading` in place, so the person sees the file
   * they picked being tried again instead of a second tile appearing beside the
   * failed one.
   */
  const uploadFile = useCallback(
    async (file: File, existingId?: string) => {
      const id = existingId ?? `pending-${++uploadSeqRef.current}`;

      setPendingUploads((prev) => {
        const entry: PendingUpload = { id, file, name: file.name, status: 'uploading' };
        return existingId ? prev.map((p) => (p.id === id ? entry : p)) : [entry, ...prev];
      });

      const failWith = (failure: RequestFailure) => {
        setPendingUploads((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'failed', failure } : p))
        );
      };

      // Checked here as well as on the server so the obvious rejections are
      // instant and do not spend the person's upload budget. The server checks
      // again regardless; this is a courtesy, not a control.
      if (file.size > 5 * 1024 * 1024) {
        failWith({
          kind: 'rejected',
          message: 'Dung lượng tập tin phải ≤ 5MB',
          retryable: false,
        });
        return;
      }
      if (!file.type.startsWith('image/')) {
        failWith({
          kind: 'rejected',
          message: 'Chỉ hỗ trợ đính kèm hình ảnh',
          retryable: false,
        });
        return;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetchWithTimeout(
          `/api/rooms/${slug}/attachments`,
          { method: 'POST', body: formData },
          UPLOAD_TIMEOUT_MS
        );

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.attachment) {
          failWith(failureFromResponse(res.status, data, res.headers.get('Retry-After')));
          return;
        }

        // Only now does the file become an attachment. Until this line it has
        // been a pending tile with a spinner, so nothing has ever claimed the
        // image was stored before the server said so.
        setAttachments((prev) => [data.attachment, ...prev]);
        setPendingUploads((prev) => prev.filter((p) => p.id !== id));
        notifyPeers();
      } catch (err) {
        failWith(
          failureFromThrown(err, typeof navigator === 'undefined' ? true : navigator.onLine)
        );
      }
    },
    [slug, notifyPeers]
  );

  const retryUpload = useCallback(
    (id: string) => {
      const entry = pendingUploads.find((p) => p.id === id);
      if (entry) void uploadFile(entry.file, id);
    },
    [pendingUploads, uploadFile]
  );

  const dismissUpload = useCallback((id: string) => {
    setPendingUploads((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        if (attachments.length + pendingUploads.length >= 20) {
          showToast('Phòng đã đạt giới hạn tối đa 20 ảnh đính kèm', 'error');
          break;
        }
        void uploadFile(file);
      }
    }
  };

  // Depth counter: dragging over a child element fires dragleave on the parent,
  // which made the overlay flicker.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files ?? []);
    for (const file of files) {
      if (attachments.length + pendingUploads.length >= 20) {
        showToast('Phòng đã đạt giới hạn tối đa 20 ảnh đính kèm', 'error');
        break;
      }
      void uploadFile(file);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    const res = await fetch(`/api/rooms/${slug}/attachments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Xóa ảnh thất bại');
    }

    setAttachments((prev) => prev.filter((a) => a.id !== id));
    notifyPeers();
  };

  const handleCopyAllText = async () => {
    if (!content) {
      showToast('Không có nội dung text để copy', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      showToast('Đã copy toàn bộ text vào clipboard!', 'success');
    } catch {
      showToast('Trình duyệt chặn truy cập clipboard', 'error');
    }
  };

  const handleDeleteRoom = async () => {
    if (
      !confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ nội dung và hình ảnh của phòng này ngay lập tức?'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Lỗi khi xóa phòng', 'error');
        return;
      }
      showToast('Đã xóa phòng thành công', 'success');
      router.push('/');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi xóa phòng', 'error');
    }
  };

  const lineCount = content ? content.split('\n').length : 1;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-background"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <EditorHeader
        slug={slug}
        hasPin={hasPin}
        canManage={capabilities.canManage}
        onCopyAllText={handleCopyAllText}
        onOpenPinModal={() => setPinModalOpen(true)}
        onDeleteRoom={handleDeleteRoom}
      />

      {/* Only for the creator, and only on the load that follows creation. */}
      {justCreated && capabilities.canManage && <OwnerNotice />}

      {/* Chrome (header + rail) sits on the darkest surface and the buffer on
          the lighter page ground, so the writing area reads as lit and framed
          rather than as one more panel. */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextChange}
          onPaste={handlePaste}
          placeholder="Dán hoặc gõ ở đây. Mở cùng URL trên thiết bị khác để thấy nội dung."
          spellCheck={false}
          aria-label="Nội dung phòng"
          className="w-full flex-1 resize-none overflow-y-auto bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-foreground-tertiary focus:outline-none sm:p-6"
        />

        <StatusRail
          onlineCount={onlineCount}
          saveStatus={isOffline && saveStatus !== 'error' ? 'offline' : saveStatus}
          saveFailure={saveFailure}
          onRetrySave={retrySave}
          lastSavedAt={lastSavedAt}
          lines={lineCount}
          words={wordCount}
          chars={content.length}
          maxChars={MAX_CHARS}
        />
      </main>

      <AttachmentGrid
        attachments={attachments}
        pending={pendingUploads}
        canDelete={capabilities.canDeleteEvidence}
        onDeleteAttachment={handleDeleteAttachment}
        onRetryUpload={retryUpload}
        onDismissUpload={dismissUpload}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center bg-background/95 p-6 text-center">
          <div className="rounded-lg border border-dashed border-border-contrast px-8 py-7">
            <UploadCloud
              className="mx-auto mb-3 h-6 w-6 text-foreground-tertiary"
              strokeWidth={1.75}
            />
            <p className="text-sm font-medium text-foreground">Thả ảnh để đính kèm</p>
            <p className="mt-1 font-mono text-xs text-foreground-tertiary">PNG, JPEG, WebP · ≤ 5MB</p>
          </div>
        </div>
      )}

      <PinModal
        isOpen={pinModalOpen && capabilities.canManage}
        mode="set"
        slug={slug}
        hasPin={hasPin}
        onClose={() => setPinModalOpen(false)}
        onSuccess={(nextHasPin) => {
          setHasPin(nextHasPin);
          setPinModalOpen(false);
        }}
      />
    </div>
  );
}
