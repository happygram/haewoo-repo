// 프론트는 항상 같은 출처(origin)의 상대경로(`/api/...`)로 호출합니다.
// ALB/CloudFront 등에서 `/*`와 `/api/*`를 분기하도록 구성하면,
// `VITE_API_BASE`(빌드타임 값) 변경/재빌드가 필요 없습니다.
const API_BASE = "";

function headersWithToken(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function loginAdmin({ username, password }) {
  return requestJson("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getHalls(token) {
  return requestJson("/api/halls", { method: "GET", headers: headersWithToken(token) });
}

export async function createHall(token, { name }) {
  return requestJson("/api/halls", {
    method: "POST",
    headers: headersWithToken(token),
    body: JSON.stringify({ name }),
  });
}

export async function createRoom(token, { hallId, name, displaySize }) {
  return requestJson("/api/rooms", {
    method: "POST",
    headers: headersWithToken(token),
    body: JSON.stringify({
      hallId,
      name,
      displaySize,
    }),
  });
}

export async function updateHall(token, hallId, { name, isActive }) {
  const body = {};
  if (name != null) body.name = name;
  if (isActive != null) body.isActive = isActive;
  return requestJson(`/api/halls/${hallId}`, {
    method: "PATCH",
    headers: headersWithToken(token),
    body: JSON.stringify(body),
  });
}

export async function deleteHall(token, hallId) {
  return requestJson(`/api/halls/${hallId}`, {
    method: "DELETE",
    headers: headersWithToken(token),
  });
}

export async function updateRoom(token, roomId, { name, displaySize, isActive }) {
  const body = {};
  if (name != null) body.name = name;
  if (displaySize != null) body.displaySize = displaySize;
  if (isActive != null) body.isActive = isActive;
  return requestJson(`/api/rooms/${roomId}`, {
    method: "PATCH",
    headers: headersWithToken(token),
    body: JSON.stringify(body),
  });
}

export async function deleteRoom(token, roomId) {
  return requestJson(`/api/rooms/${roomId}`, {
    method: "DELETE",
    headers: headersWithToken(token),
  });
}

export async function getRoomSlides(token, roomId) {
  return requestJson(`/api/rooms/${roomId}/slides`, {
    method: "GET",
    headers: headersWithToken(token),
  });
}

export async function setRoomActiveSlide(token, roomId, { slideId }) {
  return requestJson(`/api/rooms/${roomId}/active-slide`, {
    method: "POST",
    headers: headersWithToken(token),
    body: JSON.stringify({ slideId }),
  });
}

export async function uploadSlide(token, { roomId, file, caption, sortOrder, displaySize }) {
  const form = new FormData();
  form.append("file", file);
  if (caption != null) form.append("caption", String(caption));
  if (sortOrder != null) form.append("sortOrder", String(sortOrder));
  if (displaySize != null) form.append("displaySize", String(displaySize));

  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/slides/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        const j = JSON.parse(text);
        const msg = j.detail || j.error || text;
        throw new Error(msg);
      } catch {
        throw new Error(text);
      }
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteSlide(token, roomId, slideId) {
  return requestJson(`/api/rooms/${roomId}/slides/${slideId}`, {
    method: "DELETE",
    headers: headersWithToken(token),
  });
}

export async function getKioskRoomConfig({ roomId }) {
  return requestJson(`/api/kiosk/room/${roomId}`, { method: "GET" });
}

