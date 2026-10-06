'use client';

import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Reply,
  Edit2,
  Trash2,
  FileText,
  Download,
  X,
  Check as SaveCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Message, useChat } from '@/lib/chat-context';
import { useAuth } from '@/lib/auth-context';
import { formatMessageTime, formatFileSize } from '@/lib/utils';

interface MessageItemProps {
  message: Message;
  isGroup: boolean;
}

export function MessageItem({ message, isGroup }: MessageItemProps) {
  const { user } = useAuth();
  const { setReplyingTo, editMessage, deleteMessage } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');

  const isMe = message.senderId === user?.id;

  // Compute receipt status: Read > Delivered > Sent
  const getReceiptStatus = (): 'SENT' | 'DELIVERED' | 'READ' => {
    if (!message.receipts || message.receipts.length === 0) return 'SENT';
    const hasRead = message.receipts.some((r) => r.status === 'READ');
    if (hasRead) return 'READ';
    const hasDelivered = message.receipts.some((r) => r.status === 'DELIVERED');
    if (hasDelivered) return 'DELIVERED';
    return 'SENT';
  };

  const receiptStatus = getReceiptStatus();

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    await editMessage(message.id, editContent.trim());
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Delete this message for everyone?')) {
      await deleteMessage(message.id);
    }
  };

  return (
    <div
      className={`group flex items-end space-x-2.5 my-1.5 px-4 transition-colors ${
        isMe ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Peer avatar for non-user messages in groups */}
      {!isMe && (
        <Avatar
          src={message.sender.avatarUrl}
          name={message.sender.displayName}
          size="sm"
          className="mb-1"
        />
      )}

      {/* Action buttons (Reply, Edit, Delete) on hover */}
      {isMe && !message.isDeleted && !isEditing && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 mb-1 transition-opacity">
          <button
            onClick={() => setReplyingTo(message)}
            title="Reply"
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setEditContent(message.content || '');
              setIsEditing(true);
            }}
            title="Edit"
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            title="Delete"
            className="p-1 text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`max-w-[78%] sm:max-w-md lg:max-w-lg rounded-2xl p-3 shadow-xs relative text-sm ${
          isMe
            ? 'bg-blue-600 text-white rounded-br-xs'
            : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-100 dark:border-neutral-700/60 rounded-bl-xs'
        }`}
      >
        {/* Sender name for group chats */}
        {!isMe && isGroup && (
          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
            {message.sender.displayName}
          </p>
        )}

        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            className={`mb-2 p-2 rounded-xl border-l-3 text-xs ${
              isMe
                ? 'bg-blue-700/60 border-white/80 text-blue-100'
                : 'bg-neutral-100 dark:bg-neutral-700/50 border-blue-500 text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <span className="font-semibold block text-[11px] mb-0.5">
              {message.replyTo.sender.displayName}
            </span>
            <p className="truncate line-clamp-1">{message.replyTo.content}</p>
          </div>
        )}

        {/* Deleted Message State */}
        {message.isDeleted ? (
          <p className="italic text-xs opacity-75">This message was deleted</p>
        ) : isEditing ? (
          /* Inline Editing */
          <div className="space-y-2 text-neutral-900 dark:text-neutral-100">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-hidden"
            />
            <div className="flex justify-end space-x-1.5">
              <button
                onClick={() => setIsEditing(false)}
                className="p-1 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:opacity-80 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleSaveEdit}
                className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
              >
                <SaveCheck className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="space-y-2 mb-2">
                {message.attachments.map((att) => {
                  const isImg = att.mimeType.startsWith('image/');
                  const fullUrl = att.fileUrl.startsWith('http')
                    ? att.fileUrl
                    : `${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000'}${att.fileUrl}`;

                  return isImg ? (
                    <div key={att.id} className="rounded-xl overflow-hidden max-h-72">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fullUrl}
                        alt={att.fileName}
                        className="w-full h-auto object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => window.open(fullUrl, '_blank')}
                      />
                    </div>
                  ) : (
                    <a
                      key={att.id}
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center space-x-3 p-2.5 rounded-xl transition-colors ${
                        isMe
                          ? 'bg-blue-700/60 hover:bg-blue-700 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <FileText className="w-5 h-5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{att.fileName}</p>
                        <p className="text-[10px] opacity-75">{formatFileSize(att.fileSize)}</p>
                      </div>
                      <Download className="w-4 h-4 flex-shrink-0 opacity-75" />
                    </a>
                  );
                })}
              </div>
            )}

            {/* Message Text Content */}
            {message.content && (
              <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                {message.content}
              </p>
            )}
          </>
        )}

        {/* Footer: Time, Edited label, Read Receipts */}
        <div
          className={`flex items-center justify-end space-x-1.5 mt-1 text-[10px] ${
            isMe ? 'text-blue-100' : 'text-neutral-400 dark:text-neutral-500'
          }`}
        >
          {message.isEdited && !message.isDeleted && (
            <span className="italic opacity-80">(edited)</span>
          )}
          <span>{formatMessageTime(message.createdAt)}</span>

          {/* Delivery & Read Receipts for own messages */}
          {isMe && !message.isDeleted && (
            <span className="inline-flex items-center" title={receiptStatus}>
              {receiptStatus === 'READ' ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
              ) : receiptStatus === 'DELIVERED' ? (
                <CheckCheck className="w-3.5 h-3.5 opacity-80" />
              ) : (
                <Check className="w-3.5 h-3.5 opacity-80" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons (Reply) for peer messages */}
      {!isMe && !message.isDeleted && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 mb-1 transition-opacity">
          <button
            onClick={() => setReplyingTo(message)}
            title="Reply"
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
