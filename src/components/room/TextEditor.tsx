'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Attachment, Room } from '@/lib/types';
import { EditorHeader } from './EditorHeader';
import { AttachmentGrid } from './AttachmentGrid';
import { PinModal } from './PinModal';
import { useToast } from '@/components/ui/Toast';
import { UploadCloud, ShieldAlert, FileText, AlignLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TextEditorProps {
  initialRoom: Room;
  initialAttachments: Attachment[];
  slug: string;
}

const MAX_CHARS = 100000;

export function TextEditor({
  initialRoom,
  initialAttachments,
  slug,
}: TextEditorProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // Unique client ID per tab session to avoid self-echo loops
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current) {
    clientIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2);
  }

  // Room state
  const [room, setRoom] = useState<Room>(initialRoom);
  const [content, setContent] = useState<string>(initialRoom.content || '');
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [hasPin, setHasPin] = useState<boolean>(initialRoom.hasPin || false);

  // Security / PIN state
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [pinModalMode, setPinModalMode] = useState<'unlock' | 'set' | null>(null);

  // Realtime & Save status
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'idle' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdatedAtRef = useRef<string>(initialRoom.updated_at || new Date(0).toISOString());
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<any>(null);

  // Check PIN lock status on initial mount
  useEffect(() => {
    if (initialRoom.hasPin) {
      const unlocked = localStorage.getItem(`clipsync_unlocked_${slug}`);
      if (!unlocked) {
        setIsLocked(true);
        setPinModalMode('unlock');
      }
    }
  }, [initialRoom.hasPin, slug]);

  // Format timestamp for display
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

  // Perform Server Auto-Save & Broadcast Realtime
  const performSave = useCallback(
    async (textToSave: string) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/rooms/${slug}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: textToSave }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Lỗi lưu tự động');
        }

        const newUpdatedAt = data.updated_at || new Date().toISOString();
        lastUpdatedAtRef.current = newUpdatedAt;
        setLastSavedAt(formatTime(newUpdatedAt));
        setSaveStatus('saved');

        // Broadcast Realtime Event to other tabs
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'text_update',
            payload: {
              clientId: clientIdRef.current,
              content: textToSave,
              updated_at: newUpdatedAt,
            },
          });
        }
      } catch (err: any) {
        setSaveStatus('error');
        showToast(err.message || 'Không thể kết nối lưu tự động', 'error');
      }
    },
    [slug, showToast]
  );

  // Textarea input change handler with 500ms debounce
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length > MAX_CHARS) {
      showToast(`Đã đạt giới hạn tối đa ${MAX_CHARS.toLocaleString()} ký tự`, 'error');
      return;
    }

    setContent(val);
    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 500ms Debounce auto-save
    saveTimeoutRef.current = setTimeout(() => {
      performSave(val);
    }, 500);
  };

  // Realtime setup (Broadcast + Presence)
  useEffect(() => {
    if (isLocked) return;

    const supabase = supabaseRef.current;
    const channel = supabase.channel(`room:${slug}`, {
      config: {
        presence: {
          key: clientIdRef.current,
        },
      },
    });

    channelRef.current = channel;

    // Listen to incoming Broadcast text updates
    channel.on('broadcast', { event: 'text_update' }, (response: any) => {
      const payload = response.payload;
      if (!payload) return;

      // Filter self echo!
      if (payload.clientId === clientIdRef.current) {
        return;
      }

      // Check Last-write-wins by timestamp
      const remoteTime = new Date(payload.updated_at).getTime();
      const localTime = new Date(lastUpdatedAtRef.current).getTime();

      if (remoteTime >= localTime) {
        lastUpdatedAtRef.current = payload.updated_at;
        const isFocused = textareaRef.current === document.activeElement;

        if (!isFocused) {
          // Unfocused: update text directly
          setContent(payload.content);
        } else {
          // Focused: merge content while preserving selection position
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            setContent(payload.content);

            // Re-apply cursor position on next tick
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                const maxLen = payload.content.length;
                textareaRef.current.setSelectionRange(
                  Math.min(start, maxLen),
                  Math.min(end, maxLen)
                );
              }
            });
          }
        }
        setLastSavedAt(formatTime(payload.updated_at));
        setSaveStatus('saved');
      }
    });

    // Listen to incoming Attachment updates
    channel.on('broadcast', { event: 'attachment_update' }, (response: any) => {
      const payload = response.payload;
      if (!payload || payload.clientId === clientIdRef.current) return;

      if (payload.action === 'add' && payload.attachment) {
        setAttachments((prev) => [payload.attachment, ...prev.filter((a) => a.id !== payload.attachment.id)]);
      } else if (payload.action === 'delete' && payload.attachmentId) {
        setAttachments((prev) => prev.filter((a) => a.id !== payload.attachmentId));
      }
    });

    // Presence tracking
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setOnlineCount(Math.max(1, count));
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            clientId: clientIdRef.current,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [slug, isLocked, performSave]);

  // Handle Attachment Upload (Paste or Drop)
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Tải ảnh lên thất bại');
      }

      const newAtt = data.attachment;
      setAttachments((prev) => [newAtt, ...prev]);
      showToast('Đã đính kèm ảnh thành công!', 'success');

      // Broadcast attachment update
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'attachment_update',
          payload: {
            clientId: clientIdRef.current,
            action: 'add',
            attachment: newAtt,
          },
        });
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải ảnh lên', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Clipboard Paste listener (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          uploadFile(file);
        }
      }
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
      }
    }
  };

  // Delete Attachment
  const handleDeleteAttachment = async (id: string) => {
    const res = await fetch(`/api/rooms/${slug}/attachments?id=${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Xóa ảnh thất bại');
    }

    setAttachments((prev) => prev.filter((a) => a.id !== id));

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'attachment_update',
        payload: {
          clientId: clientIdRef.current,
          action: 'delete',
          attachmentId: id,
        },
      });
    }
  };

  // Copy All Text
  const handleCopyAllText = () => {
    if (!content) {
      showToast('Không có nội dung text để copy', 'info');
      return;
    }
    navigator.clipboard.writeText(content);
    showToast('Đã copy toàn bộ text vào clipboard!', 'success');
  };

  // Delete Room Action ("Xóa phòng này ngay")
  const handleDeleteRoom = async () => {
    if (
      confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ nội dung và hình ảnh của phòng này ngay lập tức?'
      )
    ) {
      try {
        const res = await fetch(`/api/rooms/${slug}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          localStorage.removeItem(`clipsync_unlocked_${slug}`);
          showToast('Đã xóa phòng thành công', 'success');
          router.push('/');
        } else {
          showToast('Lỗi khi xóa phòng', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Lỗi khi xóa phòng', 'error');
      }
    }
  };

  // Line count helper
  const lineCount = content ? content.split('\n').length : 1;

  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 bg-radial-glow">
        <div className="glass-panel rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-white/10">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Phòng bị khóa PIN</h1>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Nội dung phòng này đã được thiết lập bảo vệ. Vui lòng mở khóa để tiếp tục.
          </p>
          <button
            onClick={() => setPinModalMode('unlock')}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            Nhập mã PIN mở khóa
          </button>
        </div>

        <PinModal
          isOpen={pinModalMode === 'unlock'}
          mode="unlock"
          slug={slug}
          hasPin={hasPin}
          onSuccess={() => {
            setIsLocked(false);
            setPinModalMode(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 relative bg-editor-grid"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <EditorHeader
        slug={slug}
        onlineCount={onlineCount}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        hasPin={hasPin}
        onCopyAllText={handleCopyAllText}
        onOpenPinModal={() => setPinModalMode('set')}
        onDeleteRoom={handleDeleteRoom}
      />

      {/* Main Full-Screen Monospace Workspace */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950/70 backdrop-blur-sm">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextChange}
          onPaste={handlePaste}
          placeholder="Dán (Ctrl+V) hoặc gõ văn bản tại đây... Mở cùng URL này trên thiết bị khác để thấy nội dung tức thì."
          spellCheck={false}
          className="w-full flex-1 p-6 sm:p-8 bg-transparent font-mono text-sm sm:text-base leading-relaxed text-slate-100 placeholder:text-slate-600 focus:outline-none resize-none overflow-y-auto selection:bg-blue-500/30 selection:text-white"
        />

        {/* Floating Bottom Info Bar */}
        <div className="h-8 border-t border-white/5 bg-slate-950/80 px-4 sm:px-6 flex items-center justify-between text-[11px] font-mono text-slate-500 select-none shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <AlignLeft className="w-3 h-3 text-slate-600" />
              <span>{lineCount} dòng</span>
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-600" />
              <span>{content.trim() ? content.trim().split(/\s+/).length : 0} từ</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={
                content.length >= MAX_CHARS * 0.9 ? 'text-amber-400 font-bold' : ''
              }
            >
              {content.length.toLocaleString()}
            </span>
            <span className="text-slate-600">/ {MAX_CHARS.toLocaleString()} ký tự</span>
          </div>
        </div>
      </main>

      {/* Attachments Thumbnail Grid */}
      <AttachmentGrid
        attachments={attachments}
        uploading={uploading}
        onDeleteAttachment={handleDeleteAttachment}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-950/90 backdrop-blur-md border-2 border-dashed border-blue-400 flex flex-col items-center justify-center text-center p-6 animate-in fade-in">
          <div className="w-20 h-20 rounded-3xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mb-4 animate-bounce">
            <UploadCloud className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">Thả hình ảnh vào đây</h3>
          <p className="text-xs text-blue-200 mt-1.5 font-mono">
            Tự động đính kèm và đồng bộ tức thì đến tất cả thiết bị
          </p>
        </div>
      )}

      {/* PIN Setup / Unlock Modal */}
      <PinModal
        isOpen={pinModalMode !== null}
        mode={pinModalMode || 'set'}
        slug={slug}
        hasPin={hasPin}
        onClose={() => setPinModalMode(null)}
        onSuccess={() => {
          setHasPin(pinModalMode === 'set' ? true : hasPin);
          setPinModalMode(null);
          setIsLocked(false);
        }}
      />
    </div>
  );
}
