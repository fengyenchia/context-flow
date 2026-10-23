"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { IconUsers, IconLoader2 } from "@tabler/icons-react";
import {
  listMembers,
  changeMemberRole,
  removeMember,
  type WorkspaceMember,
} from "@/lib/api/workspaces";
import type { Workspace } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";

export function WorkspaceMembers({
  workspace,
  onChanged,
}: {
  workspace: Workspace;
  onChanged: () => Promise<void>;
}) {
  const userId = useAuthStore((value) => value.user?.id);
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string>();
  const loadSequence = useRef(0);
  function close() {
    loadSequence.current++;
    setOpen(false);
  }
  async function perform(action: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setConfirm(undefined);
      await onChanged();
      if (refresh) setMembers(await listMembers(workspace.id));
      else {
        setMembers(null);
        setOpen(false);
      }
      setNotice("成員資料已更新");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法更新成員");
    } finally {
      setBusy(false);
    }
  }
  async function showMembers() {
    const sequence = ++loadSequence.current;
    setOpen(true);
    setMembers(null);
    setConfirm(undefined);
    setNotice("");
    setLoading(true);
    setError("");
    try {
      const result = await listMembers(workspace.id);
      if (sequence === loadSequence.current) setMembers(result);
    } catch (reason) {
      if (sequence === loadSequence.current)
        setError(reason instanceof Error ? reason.message : "無法讀取成員");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => void showMembers()}
      >
        <IconUsers className="size-4" />
        查看成員
      </Button>
      <Modal
        open={open}
        onClose={close}
        dismissible={!busy}
        title="工作區成員"
        description={`${workspace.name} · ${members?.length ?? workspace.memberCount} 位成員`}
      >
        <p className="mb-4 text-sm text-muted">
          {["owner", "admin"].includes(workspace.role)
            ? "查看團隊成員，或調整你有權管理的角色。"
            : "你可以查看團隊成員；角色由擁有者或管理員調整。"}
        </p>
        {loading && (
          <div
            role="status"
            className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted"
          >
            <IconLoader2 className="size-5 animate-spin text-primary" />
            正在載入成員…
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="mb-3 rounded-primary bg-secondary p-3 text-sm"
          >
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
            {!loading && !members && (
              <Button
                variant="outline"
                size="sm"
                className="ml-3"
                onClick={() => void showMembers()}
              >
                重新載入
              </Button>
            )}
          </p>
        )}
        {members && (
          <ul
            aria-label="成員清單"
            aria-busy={busy}
            className="divide-y divide-border rounded-xl border border-border bg-surface px-4"
          >
            {members.map((member) => {
              const canManage =
                member.role !== "owner" &&
                (workspace.role === "owner" ||
                  (workspace.role === "admin" && member.role !== "admin"));
              const isSelf = member.userId === userId;
              return (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">
                      {member.displayName}
                      {isSelf ? "（你）" : ""}
                    </p>
                    <p className="text-xs text-muted">@{member.username}</p>
                  </div>
                  {canManage ? (
                    <select
                      aria-label={`${member.username} 的角色`}
                      className="min-h-10 rounded-primary border bg-surface px-3"
                      value={member.role}
                      disabled={busy}
                      onChange={(event) =>
                        void perform(() =>
                          changeMemberRole(
                            workspace.id,
                            member.userId,
                            event.target.value,
                          ),
                        )
                      }
                    >
                      {workspace.role === "owner" && (
                        <option value="admin">管理員</option>
                      )}
                      <option value="editor">可編輯</option>
                      <option value="viewer">僅檢視</option>
                    </select>
                  ) : (
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted">
                      {
                        {
                          owner: "擁有者",
                          admin: "管理員",
                          editor: "可編輯",
                          viewer: "僅檢視",
                        }[member.role]
                      }
                    </span>
                  )}
                  {(canManage || (isSelf && member.role !== "owner")) &&
                    (confirm === member.userId ? (
                      <div className="flex w-full flex-wrap items-center gap-2 rounded-primary border border-destructive/20 bg-destructive/5 p-3">
                        <span className="flex-1 text-destructive">
                          {isSelf
                            ? "離開後將無法存取此工作區的專案。確定離開？"
                            : `確定移除 ${member.displayName}？對方將失去工作區存取權。`}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              () => removeMember(workspace.id, member.userId),
                              !isSelf,
                            )
                          }
                        >
                          {busy ? "處理中…" : isSelf ? "確定離開" : "確定移除"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setConfirm(undefined)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={busy}
                        onClick={() => setConfirm(member.userId)}
                      >
                        {isSelf ? "離開工作區" : "移除成員"}
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        {!loading && members?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">目前沒有成員</p>
        )}
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <Button variant="outline" disabled={busy} onClick={close}>
            完成
          </Button>
        </div>
      </Modal>
    </>
  );
}
