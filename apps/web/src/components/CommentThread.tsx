import { Popover } from "radix-ui";
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { viMessages } from "../i18n/vi";
import { formatDateTime, formatRelativeTime } from "../lib/date";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Combobox } from "./Combobox";
import { EmptyState } from "./EmptyState";
import { SkeletonText } from "./Skeleton";
import { Textarea } from "./Textarea";

export interface CommentData {
  id: string;
  author: { name: string; src?: string };
  /** Thời điểm dạng ISO, ví dụ 2026-10-31T09:30:00Z. */
  createdAt: string;
  body: string;
  edited?: boolean;
  isQuestion?: boolean;
  replies?: CommentData[];
}

export interface MentionPerson {
  id: string;
  name: string;
}

export interface CommentThreadProps {
  comments: CommentData[];
  /** Gửi nhận xét mới (hoặc trả lời nếu có parentId). Ném lỗi khi thất bại. */
  onSubmit: (input: { body: string; parentId?: string }) => Promise<void>;
  /** Danh sách người có thể nhắc tên. Rỗng thì ẩn tính năng nhắc tên. */
  people?: MentionPerson[];
  now?: Date;
  loading?: boolean;
}

interface ComposerProps {
  label: string;
  submitLabel: string;
  people: MentionPerson[];
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

function Composer({
  label,
  submitLabel,
  people,
  onSubmit,
  onCancel,
  autoFocus,
}: ComposerProps) {
  const text = viMessages.comments;
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mentionOpen, setMentionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(0);
  const pendingCaret = useRef<number | null>(null);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await onSubmit(trimmed);
      setBody("");
    } catch {
      setError(text.submitFailed);
    } finally {
      setSending(false);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const position = event.target.selectionStart ?? value.length;
    setBody(value);
    const justTyped =
      value[position - 1] === "@" &&
      (position === 1 || /\s/.test(value[position - 2]));
    if (justTyped && people.length > 0) {
      caretRef.current = position - 1;
      setMentionOpen(true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  const insertMention = (person: MentionPerson) => {
    const at = caretRef.current;
    const hasAt = body[at] === "@";
    const before = body.slice(0, at);
    const after = body.slice(hasAt ? at + 1 : at);
    const inserted = `@${person.name} `;
    setBody(before + inserted + after);
    pendingCaret.current = before.length + inserted.length;
    setMentionOpen(false);
  };

  const hint =
    people.length > 0 ? `${text.hint} ${text.mentionHint}` : text.hint;

  return (
    <div className="flex flex-col gap-8">
      <Popover.Root open={mentionOpen} onOpenChange={setMentionOpen}>
        <Popover.Anchor asChild>
          <div>
            <Textarea
              ref={textareaRef}
              label={label}
              hint={hint}
              error={error}
              value={body}
              readOnly={sending}
              autoFocus={autoFocus}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const element = textareaRef.current;
              if (!element) return;
              element.focus();
              if (pendingCaret.current !== null) {
                element.setSelectionRange(
                  pendingCaret.current,
                  pendingCaret.current,
                );
                pendingCaret.current = null;
              }
            }}
            className="z-50 w-256 rounded-lg border border-border-strong bg-surface-raised p-12 shadow-4"
          >
            <Combobox
              autoFocus
              defaultOpen
              label={text.mentionLabel}
              placeholder={text.mentionPlaceholder}
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
              }))}
              onValueChange={(ids) => {
                const person = people.find((p) => p.id === ids[0]);
                if (person) insertMention(person);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="flex flex-wrap items-center justify-end gap-8">
        {people.length > 0 ? (
          <Button
            icon={<span aria-hidden="true">@</span>}
            onClick={() => {
              caretRef.current =
                textareaRef.current?.selectionStart ?? body.length;
              setMentionOpen(true);
            }}
          >
            {text.mention}
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {viMessages.common.cancel}
          </Button>
        ) : null}
        <Button
          variant="primary"
          loading={sending}
          disabled={body.trim() === ""}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function CommentThread({
  comments,
  onSubmit,
  people = [],
  now,
  loading,
}: CommentThreadProps) {
  const text = viMessages.comments;
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const renderComment = (comment: CommentData, depth: number) => (
    <li key={comment.id} className="flex flex-col gap-8">
      <article
        aria-label={text.articleLabel(comment.author.name)}
        className="flex gap-12"
      >
        <Avatar name={comment.author.name} src={comment.author.src} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <span className="text-md font-medium">{comment.author.name}</span>
            <time
              dateTime={comment.createdAt}
              title={formatDateTime(comment.createdAt)}
              className="text-xs text-text-secondary"
            >
              {formatRelativeTime(comment.createdAt, now)}
            </time>
            {comment.edited ? (
              <span className="text-xs text-text-secondary">
                ({text.edited})
              </span>
            ) : null}
            {comment.isQuestion ? (
              <Badge tone="warning">{text.question}</Badge>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap break-words text-md">
            {comment.body}
          </p>
          {depth === 0 ? (
            <div>
              <Button
                variant="ghost"
                aria-label={`${text.reply} ${comment.author.name}`}
                onClick={() =>
                  setReplyingId(replyingId === comment.id ? null : comment.id)
                }
              >
                {text.reply}
              </Button>
            </div>
          ) : null}
        </div>
      </article>
      {replyingId === comment.id ? (
        <div className="ml-32">
          <Composer
            autoFocus
            label={text.writeReply(comment.author.name)}
            submitLabel={text.sendReply}
            people={people}
            onCancel={() => setReplyingId(null)}
            onSubmit={async (body) => {
              await onSubmit({ body, parentId: comment.id });
              setReplyingId(null);
            }}
          />
        </div>
      ) : null}
      {comment.replies && comment.replies.length > 0 ? (
        <ol className="ml-32 flex flex-col gap-12 border-l border-border-default pl-12">
          {comment.replies.map((reply) => renderComment(reply, depth + 1))}
        </ol>
      ) : null}
    </li>
  );

  return (
    <section aria-label={text.region} className="flex flex-col gap-16">
      {loading ? (
        <SkeletonText lines={4} />
      ) : comments.length === 0 ? (
        <EmptyState title={text.empty} description={text.emptyHint} />
      ) : (
        <ol className="flex flex-col gap-16">
          {comments.map((comment) => renderComment(comment, 0))}
        </ol>
      )}
      <Composer
        label={text.write}
        submitLabel={text.send}
        people={people}
        onSubmit={(body) => onSubmit({ body })}
      />
    </section>
  );
}
