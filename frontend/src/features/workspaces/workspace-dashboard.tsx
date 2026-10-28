"use client";

import { ProjectCard } from "./project-card";
import { ProductTour } from '@/features/onboarding/product-tour';
import { WorkspaceMembers } from "./workspace-members";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconUserPlus as UserPlus,
  IconUsers as Users,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createProject, listProjects } from "@/lib/api/projects";
import { listSharedProjects } from '@/lib/api/project-invites';
import {
  createWorkspace as createWorkspaceApi,
  inviteWorkspaceMember,
  listInvitations,
  listWorkspaces,
  respondToInvitation,
} from "@/lib/api/workspaces";
import type {
  Invitation,
  Project,
  Workspace,
  WorkspaceRole,
} from "@/lib/api/types";

export function WorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      const entries = await Promise.all(
        ws.map(
          async (workspace) =>
            [workspace.id, await listProjects(workspace.id)] as const,
        ),
      );
      setProjects(Object.fromEntries(entries));
      setInvitations(await listInvitations());
      setSharedProjects(await listSharedProjects().catch(() => []));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法讀取工作區");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      await createWorkspaceApi(String(form.get("name")));
      setShowCreate(false);
      await load();
    } catch (reason) {
      setCreateError(
        reason instanceof Error ? reason.message : "工作區建立失敗",
      );
    } finally {
      setCreateBusy(false);
    }
  }
  async function respond(id: string, action: "accept" | "decline") {
    try {
      await respondToInvitation(id, action);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "邀請更新失敗");
    }
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2
          className="size-6 animate-spin text-primary"
          aria-label="載入工作區"
        />
      </div>
    );
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 data-tour="workspaces" className="text-3xl font-semibold tracking-tight">
            工作區
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductTour stage="workspace" />
          <Button
            data-tour="create-workspace"
            aria-haspopup="dialog"
            onClick={() => {
              setCreateError("");
              setShowCreate(true);
            }}
          >
            <Plus className="size-4" />
            新增共享工作區
          </Button>
        </div>
      </header>
      {error && (
        <div
          className="mt-6 rounded-primary border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      {invitations.length > 0 && (
        <section className="mt-8 rounded-primary border border-primary/20 bg-primary/10 p-5">
          <h2 className="font-semibold">待處理邀請</h2>
          <div className="mt-3 space-y-3">
            {invitations.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 rounded-primary bg-surface p-4 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <p className="font-medium">{invite.workspace.name}</p>
                  <p className="text-sm text-muted">邀請角色：{invite.role}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respond(invite.id, "accept")}
                  >
                    接受
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respond(invite.id, "decline")}
                  >
                    略過
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        dismissible={!createBusy}
        title="建立共享工作區"
      >
        <form onSubmit={createWorkspace} className="space-y-4">
          <label htmlFor="workspace-name" className="block text-sm font-medium">
            工作區名稱
          </label>
          <Input
            id="workspace-name"
            name="name"
            required
            autoFocus
            disabled={createBusy}
            placeholder="例如：2026 畢製團隊"
          />
          {createError && (
            <p
              role="alert"
              className="rounded-primary bg-destructive/10 p-3 text-sm text-destructive"
            >
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={createBusy}
              onClick={() => setShowCreate(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={createBusy}>
              {createBusy ? "建立中…" : "建立"}
            </Button>
          </div>
        </form>
      </Modal>
      <section className="mt-10 space-y-8">
        {sharedProjects.length > 0 && <section aria-label="受邀專案"><h2 className="mb-4 font-semibold">受邀專案</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{sharedProjects.map(project => <ProjectCard key={project.id} project={project} role="viewer" onChanged={load} />)}</div></section>}
        {workspaces.map((workspace) => (
          <section key={workspace.id} aria-label={workspace.name}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-primary bg-secondary">
                <Users className="size-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{workspace.name}</h2>
                  <Badge>
                    {workspace.kind === "personal"
                      ? "個人"
                      : {
                          owner: "擁有者",
                          admin: "管理員",
                          editor: "可編輯",
                          viewer: "僅檢視",
                        }[workspace.role]}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  {workspace.memberCount} 位成員 · {workspace.projectCount}{" "}
                  個專案
                </p>
              </div>
              {workspace.kind === "shared" && (
                <div className="flex flex-wrap items-center gap-2">
                  <WorkspaceMembers workspace={workspace} onChanged={load} />
                  {["owner", "admin"].includes(workspace.role) && (
                    <InviteMember
                      workspaceId={workspace.id}
                      workspaceName={workspace.name}
                      canInviteAdmin={workspace.role === "owner"}
                      onInvited={load}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(projects[workspace.id] ?? []).map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  role={workspace.role}
                  onChanged={load}
                />
              ))}
              {workspace.role !== "viewer" && (
                <CreateProjectCard
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  onCreated={load}
                />
              )}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}

function InviteMember({
  workspaceId,
  workspaceName,
  canInviteAdmin,
  onInvited,
}: {
  workspaceId: string;
  workspaceName: string;
  canInviteAdmin: boolean;
  onInvited: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await inviteWorkspaceMember(
        workspaceId,
        String(form.get("username")),
        String(form.get("role")) as Exclude<WorkspaceRole, "owner">,
      );
      setMessage("邀請已送出");
      setOpen(false);
      await onInvited();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "邀請失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted" role="status">
          {message}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => {
            setError("");
            setMessage("");
            setOpen(true);
          }}
        >
          <UserPlus className="size-4" />
          邀請
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title="邀請成員"
        description={`邀請已註冊的帳號加入「${workspaceName}」。對方接受邀請後才會成為成員。`}
      >
        <form onSubmit={submit} className="space-y-4">
          <label
            htmlFor={`invite-${workspaceId}`}
            className="block text-sm font-medium"
          >
            受邀帳號
          </label>
          <Input
            id={`invite-${workspaceId}`}
            name="username"
            autoFocus
            disabled={busy}
            placeholder="使用者帳號"
            required
          />
          <label
            htmlFor={`role-${workspaceId}`}
            className="block text-sm font-medium"
          >
            角色
          </label>
          <select
            id={`role-${workspaceId}`}
            name="role"
            className="min-h-10 w-full rounded-primary border border-border bg-surface px-3 text-sm"
            disabled={busy}
          >
            <option value="editor">可編輯</option>
            <option value="viewer">僅檢視</option>
            {canInviteAdmin && <option value="admin">工作區管理員</option>}
          </select>
          <p className="text-xs leading-5 text-muted">
            可編輯：修改專案與畫布。僅檢視：只能閱讀。管理員：另可管理團隊成員。
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-primary bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? "傳送中…" : "送出邀請"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function CreateProjectCard({
  workspaceId,
  workspaceName,
  onCreated,
}: {
  workspaceId: string;
  workspaceName: string;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await createProject(workspaceId, {
        name: String(form.get("name")),
        description: String(form.get("description") ?? ""),
        layoutDirection: "LR",
      });
      setOpen(false);
      await onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "專案建立失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        aria-haspopup="dialog"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        data-tour="create-project"
        className="min-h-48 rounded-primary border border-dashed p-5 text-left text-sm font-medium text-muted hover:border-primary hover:bg-surface"
      >
        <Plus className="mb-8 size-5" />
        新增專案
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title="新增專案"
        description={`工作區：${workspaceName}`}
      >
        <form onSubmit={submit} className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <label
            className="text-sm font-medium"
            htmlFor={`project-${workspaceId}`}
          >
            專案名稱
          </label>
          <Input
            id={`project-${workspaceId}`}
            name="name"
            required
            autoFocus
            disabled={busy}
          />
          <label
            className="text-sm font-medium"
            htmlFor={`description-${workspaceId}`}
          >
            說明
          </label>
          <Input
            id={`description-${workspaceId}`}
            name="description"
            disabled={busy}
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? "建立中…" : "建立"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
