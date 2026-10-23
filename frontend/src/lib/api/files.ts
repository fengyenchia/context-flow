import { api } from "./client";

export async function uploadFile(projectId: string, file: File) {
  const reservation = await api<{
    id: string;
    uploadUrl: string;
    mimeType: string;
  }>(`/projects/${projectId}/files/upload`, {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    }),
  });
  const response = await fetch(reservation.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": reservation.mimeType },
    body: file,
  });
  if (!response.ok) throw new Error("檔案上傳失敗，請確認 R2 CORS 設定後重試");
  return api<{ id: string; title: string; url: string }>(
    `/files/${reservation.id}/complete`,
    { method: "POST" },
  );
}

export async function downloadFile(id: string) {
  const { url } = await api<{ url: string }>(`/files/${id}/download`);
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.click();
}
