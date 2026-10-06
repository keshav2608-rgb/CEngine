'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useChat, Attachment } from '@/lib/chat-context';
import { api } from '@/lib/api';

export function MessageInput() {
  const { sendMessage, replyingTo, setReplyingTo, sendTypingStatus, activeRoom } = useChat();
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setContent('');
    setAttachments([]);
  }, [activeRoom?.id]);

  const handleTyping = (text: string) => {
    setContent(text);

    sendTypingStatus(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 1500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsUploading(true);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.data) {
        setAttachments((prev) => [...prev, res.data.data]);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!content.trim() && attachments.length === 0) || isUploading) return;

    const textToSend = content.trim();
    const attachmentsToSend = [...attachments];

    setContent('');
    setAttachments([]);
    sendTypingStatus(false);

    try {
      await sendMessage(textToSend, attachmentsToSend, replyingTo?.id);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 select-none">
      {/* Replying Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-600 text-xs text-neutral-700 dark:text-neutral-300">
          <div className="min-w-0 pr-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              Replying to {replyingTo.sender.displayName}:
            </span>{' '}
            <span className="truncate">{replyingTo.content || 'Attachment'}</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60">
          {attachments.map((att, idx) => {
            const isImg = att.mimeType.startsWith('image/');
            const fullUrl = att.fileUrl.startsWith('http')
              ? att.fileUrl
              : `${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000'}${att.fileUrl}`;

            return (
              <div
                key={idx}
                className="relative group flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fullUrl}
                    alt={att.fileName}
                    className="w-6 h-6 object-cover rounded-md"
                  />
                ) : (
                  <Paperclip className="w-4 h-4 text-neutral-500" />
                )}
                <span className="truncate max-w-[140px] font-medium">
                  {att.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="p-0.5 text-neutral-400 hover:text-red-500 rounded-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Upload image or file"
          className="p-2.5 text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
        />

        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Type a message..."
            value={content}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-neutral-400"
          />
        </div>

        <button
          type="submit"
          disabled={(!content.trim() && attachments.length === 0) || isUploading}
          title="Send message"
          className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors shadow-xs"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
