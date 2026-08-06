'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Attachment, Room } from '@/lib/types';
import { EditorHeader } from './EditorHeader';
import { StatusRail } from './StatusRail';
import { AttachmentGrid } from './AttachmentGrid';
import { PinModal } from './PinModal';
import { useToast } from '@/components/ui/Toast';
import { UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TextEditorProps {
  initialRoom: Room;
  initialAttachments: Attachment[];
  slug: string;
}

const MAX_CHARS = 100000;
const SAVE_DEBOUNCE_MS = 500;

export function TextEditor({ initialRoom, initialAttachments, slug }: TextEditorProps) {
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

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'idle' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdatedAtRef = useRef<string>(initialRoom.updated_at || new Date(0).toISOString());
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Monotonic counter: an older save's response must never overwrite a newer
  // one's `updated_at`, which the previous version allowed.
  const saveSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const dragDepthRef = useRef(0);

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

  const performSave = useCallback(
    async (textToSave: string) => {
      const seq = ++saveSeqRef.current;
      setSaveStatus('saving');

      try {
        const res = await fetch(`/api/rooms/${slug}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: textToSave }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Lỗi lưu tự động');

        // A response from a superseded request tells us nothing useful.
        if (seq < appliedSeqRef.current) return;
        appliedSeqRef.current = seq;

        const newUpdatedAt = data.updated_at || new Date().toISOString();
        lastUpdatedAtRef.current = newUpdatedAt;
        setLastSavedAt(formatTime(newUpdatedAt));
        setSaveStatus('saved');

        channelRef.current?.send({
          type: 'broadcast',
          event: 'room_changed',
          payload: { clientId: clientIdRef.current, updated_at: newUpdatedAt },
        });
      } catch (err) {
        if (seq < appliedSeqRef.current) return;
        setSaveStatus('error');
        showToast(err instanceof Error ? err.message : 'Không thể kết nối lưu tự động', 'error');
      }
    },
    [slug, showToast]
  );

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
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

    setContent(val);
    setSaveStatus('saving');
    scheduleSave(val);
  };

  // Flush any pending save exactly once, on unmount.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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

  const uploadFile = async (file: File) => {
    if (attachments.length >= 20) {
      showToast('Phòng đã đạt giới hạn tối đa 20 ảnh đính kèm', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Dung lượng tập tin phải ≤ 5MB', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Chỉ hỗ trợ đính kèm hình ảnh', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/rooms/${slug}/attachments`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Tải ảnh lên thất bại');

      setAttachments((prev) => [data.attachment, ...prev]);
      showToast('Đã đính kèm ảnh thành công!', 'success');
      notifyPeers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi tải ảnh lên', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) void uploadFile(file);
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
    for (const file of files) void uploadFile(file);
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
        showToast('Lỗi khi xóa phòng', 'error');
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
        onCopyAllText={handleCopyAllText}
        onOpenPinModal={() => setPinModalOpen(true)}
        onDeleteRoom={handleDeleteRoom}
      />

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
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          lines={lineCount}
          words={wordCount}
          chars={content.length}
          maxChars={MAX_CHARS}
        />
      </main>

      <AttachmentGrid
        attachments={attachments}
        uploading={uploading}
        onDeleteAttachment={handleDeleteAttachment}
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
        isOpen={pinModalOpen}
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
