"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { IconFolder, IconArrowRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { updateProject, deleteProject } from "@/lib/api/projects";
import type { Project, WorkspaceRole } from "@/lib/api/types";

export function ProjectCard({
  project,
  role,
  onChanged,
}: {
  project: Project;
  role: WorkspaceRole;
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "delete") await deleteProject(project.id);
      else
        await updateProject(project.id, {
          name: String(form.get("name")),
          description: String(form.get("description") || ""),
        });
      setMode("view");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "專案更新失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="rounded-primary border bg-surface p-5"
      aria-label={project.name}
    >
      <Link
        href={`/workspaces/${project.workspaceId}/projects/${project.id}`}
        className="group block rounded-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between">
          <span className="grid size-10 place-items-center rounded-primary bg-secondary">
            <IconFolder className="size-5 text-primary" />
          </span>
          <IconArrowRight className="size-4 text-muted" />
        </div>
        <h3 className="mt-8 font-semibold">{project.name}</h3>
        {project.accessSource === 'invitation' && <p className="mt-1 text-sm text-muted">{project.role === 'editor' ? '可編輯' : '僅檢視'}</p>}
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
          {project.description || "尚未加入專案說明"}
        </p>
      </Link>
      {role !== "viewer" && (
        <div className="mt-4 flex gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            aria-haspopup="dialog"
            onClick={() => {
              setMode("edit");
              setError("");
            }}
          >
            編輯專案
          </Button>
          {["owner", "admin"].includes(role) && (
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="dialog"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                setMode("delete");
                setError("");
                setConfirmation("");
              }}
            >
              刪除專案
            </Button>
          )}
        </div>
      )}
      <Modal
        open={mode !== "view"}
        onClose={() => setMode("view")}
        dismissible={!busy}
        title={mode === "delete" ? "刪除專案" : "編輯專案"}
        description={project.name}
      >
        <form className="space-y-3" onSubmit={submit}>
          {mode === "edit" ? (
            <>
              <label
                htmlFor={`edit-name-${project.id}`}
                className="block text-sm"
              >
                專案名稱
              </label>
              <Input
                id={`edit-name-${project.id}`}
                name="name"
                defaultValue={project.name}
                required
                maxLength={255}
                autoFocus
              />
              <label
                htmlFor={`edit-description-${project.id}`}
                className="block text-sm"
              >
                專案說明
              </label>
              <Input
                id={`edit-description-${project.id}`}
                name="description"
                defaultValue={project.description}
              />
            </>
          ) : (
            <>
              <p className="rounded-primary border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                刪除後無法從此處復原，畫布與檔案紀錄也會移除。啟用自動清理時，上傳原檔會於寬限期後清除。
              </p>
              <label htmlFor={`delete-${project.id}`} className="block text-sm">
                輸入「{project.name}」確認刪除
              </label>
              <Input
                id={`delete-${project.id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant={mode === "delete" ? "destructive" : "default"}
              disabled={
                busy || (mode === "delete" && confirmation !== project.name)
              }
            >
              {busy ? "處理中…" : mode === "delete" ? "確定刪除" : "儲存專案"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              取消
            </Button>
          </div>
        </form>
      </Modal>
    </article>
  );
}
