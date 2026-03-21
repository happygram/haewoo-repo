import React, { useEffect, useMemo, useState } from "react";
import {
  createHall,
  createRoom,
  getHalls,
  getRoomSlides,
  setRoomActiveSlide,
  uploadSlide,
} from "../api.js";

export default function AdminDashboardSimple() {
  const token = localStorage.getItem("adminToken");

  const [halls, setHalls] = useState([]);
  const allRooms = useMemo(() => halls.flatMap((h) => h.rooms || []), [halls]);
  const hallsDesc = useMemo(() => {
    // 이름 기준 오름차순
    return [...halls].sort((a, b) => {
      const an = a?.name || "";
      const bn = b?.name || "";
      return an.localeCompare(bn, "ko");
    });
  }, [halls]);

  // 1) 장례식장 생성
  const [newHallName, setNewHallName] = useState("");

  // 2) 빈소 생성
  const [roomHallId, setRoomHallId] = useState("");
  const [roomName, setRoomName] = useState("");

  // 3) 사진 업로드
  const [uploadHallId, setUploadHallId] = useState("");
  const roomsInUploadHall = useMemo(
    () =>
      [...allRooms]
        .filter((r) => r.hallId === uploadHallId)
        .sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "ko")),
    [allRooms, uploadHallId]
  );
  const [roomIdForUpload, setRoomIdForUpload] = useState("");
  const [uploadInch, setUploadInch] = useState("INCH27");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState([]);

  const [roomSlides, setRoomSlides] = useState([]);
  const [roomSlidesLoading, setRoomSlidesLoading] = useState(false);
  const [roomSlidesError, setRoomSlidesError] = useState("");
  const [roomActiveSlideId, setRoomActiveSlideId] = useState("");
  const [activeDraft, setActiveDraft] = useState("");

  const [msg, setMsg] = useState("");

  async function refresh() {
    const res = await getHalls(token);
    setHalls(res.halls || []);
  }

  const activeImageUrl = useMemo(() => {
    const cur = roomSlides.find((s) => s.id === roomActiveSlideId);
    return cur?.imageUrl || "";
  }, [roomSlides, roomActiveSlideId]);

  useEffect(() => {
    refresh().catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    if (!roomHallId && hallsDesc.length > 0) setRoomHallId(hallsDesc[0].id);
  }, [hallsDesc]);

  useEffect(() => {
    if (!uploadHallId && hallsDesc.length > 0) setUploadHallId(hallsDesc[0].id);
  }, [hallsDesc]);

  useEffect(() => {
    if (!roomIdForUpload && roomsInUploadHall.length > 0) setRoomIdForUpload(roomsInUploadHall[0].id);
    if (roomIdForUpload && roomsInUploadHall.length > 0 && !roomsInUploadHall.some((r) => r.id === roomIdForUpload)) {
      setRoomIdForUpload(roomsInUploadHall[0].id);
    }
  }, [roomsInUploadHall, roomIdForUpload]);

  useEffect(() => {
    async function loadSlides() {
      if (!roomIdForUpload) return;
      setRoomSlidesLoading(true);
      setRoomSlidesError("");
      try {
        const res = await getRoomSlides(token, roomIdForUpload);
        const slides = res.slides || [];
        const active = res.activeSlideId || "";
        setRoomSlides(slides);
        setRoomActiveSlideId(active);
        setActiveDraft(active || (slides[0] ? slides[0].id : ""));
      } catch (e) {
        setRoomSlides([]);
        setRoomActiveSlideId("");
        setActiveDraft("");
        setRoomSlidesError(e.message || "이미지 목록 조회 실패");
      } finally {
        setRoomSlidesLoading(false);
      }
    }
    loadSlides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdForUpload]);

  async function onCreateHall(e) {
    e.preventDefault();
    setMsg("");
    if (!newHallName.trim()) return;
    const res = await createHall(token, { name: newHallName });
    setNewHallName("");
    await refresh();
    setRoomHallId(res.hall?.id || roomHallId);
    setUploadHallId(res.hall?.id || uploadHallId);
    setMsg(`장례식장 생성 완료: ${res.hall?.name || ""}`);
  }

  async function onCreateRoom(e) {
    e.preventDefault();
    setMsg("");
    if (!roomHallId || !roomName.trim()) return;
    const res = await createRoom(token, { hallId: roomHallId, name: roomName });
    setRoomName("");
    await refresh();
    setMsg(`빈소 생성 완료: ${res.room?.name || ""}`);
  }

  async function onUpload(e) {
    e.preventDefault();
    setMsg("");
    if (!roomIdForUpload) {
      setMsg("업로드할 빈소를 선택하세요.");
      return;
    }
    if (!files || files.length === 0) {
      setMsg("업로드할 파일을 선택하세요.");
      return;
    }

    const applyCaption = uploadInch === "INCH32" ? caption : null;

    try {
      let idx = 0;
      for (const file of files) {
        await uploadSlide(token, {
          roomId: roomIdForUpload,
          file,
          caption: applyCaption,
          sortOrder: idx,
          displaySize: uploadInch,
        });
        idx += 1;
      }
      setFiles([]);
      setCaption("");
      setMsg("업로드 완료");
      await refresh();

      // 업로드 후 목록/활성 슬라이드 재조회
      const roomRes = await getRoomSlides(token, roomIdForUpload);
      const slides = roomRes.slides || [];
      const active = roomRes.activeSlideId || "";
      setRoomSlides(slides);
      setRoomActiveSlideId(active);
      setActiveDraft(active || (slides[0] ? slides[0].id : ""));
    } catch (err) {
      setMsg(err.message || "업로드 실패");
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>관리자 대시보드</h1>
        <div className="muted">API: {import.meta.env.VITE_API_BASE || "localhost:3001"}</div>
      </div>
      {msg ? <div className="notice">{msg}</div> : null}

      <section className="grid">
        <div className="card">
          <h2>1. 장례식장 생성</h2>
          <form onSubmit={onCreateHall}>
            <label className="field">
              <span>이름</span>
              <input value={newHallName} onChange={(e) => setNewHallName(e.target.value)} />
            </label>
            <button type="submit" disabled={!newHallName.trim()}>
              생성
            </button>
          </form>
        </div>

        <div className="card">
          <h2>2. 빈소 생성</h2>
          <form onSubmit={onCreateRoom}>
            <label className="field">
              <span>장례식장</span>
              <select
                value={roomHallId}
                onChange={(e) => {
                  const next = e.target.value;
                  setRoomHallId(next);
                  // 빈소 생성 섹션 변경 -> 업로드 섹션도 동일하게 동기화
                  setUploadHallId(next);
                }}
              >
                {hallsDesc.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>빈소 이름</span>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </label>
            <button type="submit" disabled={!roomHallId || !roomName.trim()}>
              빈소 생성
            </button>
          </form>
        </div>
      </section>

      <section className="grid">
        <div className="card wide">
          <h2>3. 사진 업로드</h2>
          <form onSubmit={onUpload}>
            <label className="field">
              <span>장례식장</span>
              <select value={uploadHallId} onChange={(e) => setUploadHallId(e.target.value)}>
                {hallsDesc.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>빈소</span>
              <select value={roomIdForUpload} onChange={(e) => setRoomIdForUpload(e.target.value)}>
                {roomsInUploadHall.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            {roomIdForUpload ? (
              <div className="muted" style={{ marginTop: 8 }}>
                키오스크 접속 URL:
                <div className="code">{window.location.origin}/kiosk?roomId={roomIdForUpload}</div>
              </div>
            ) : null}
            <label className="field">
              <span>인치</span>
              <select value={uploadInch} onChange={(e) => setUploadInch(e.target.value)}>
                <option value="INCH27">27인치 (텍스트 미표시)</option>
                <option value="INCH32">32인치 (하단 텍스트 입력)</option>
              </select>
            </label>
            {uploadInch === "INCH32" ? (
              <label className="field">
                <span>내용</span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="예: 000장례식장 특2호 / 안내 문구"
                />
              </label>
            ) : null}
            <label className="field">
              <span>사진 파일</span>
              <input type="file" multiple accept="image/*" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </label>
            <button type="submit" disabled={!roomIdForUpload || !files || files.length === 0}>
              업로드
            </button>
          </form>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>저장된 이미지 URL 목록</h2>

            {roomSlidesError ? <div className="error">{roomSlidesError}</div> : null}
            {activeImageUrl ? (
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  kiosk에서 현재 표시할 URL
                </div>
                <div className="code">{activeImageUrl}</div>
              </div>
            ) : null}
            {roomSlidesLoading ? (
              <div className="muted">목록 불러오는 중...</div>
            ) : roomSlides.length === 0 ? (
              <div className="muted">등록된 이미지가 없습니다.</div>
            ) : (
              <>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>표시할 주소</span>
                  <select value={activeDraft || roomActiveSlideId || ""} onChange={(e) => setActiveDraft(e.target.value)}>
                    {roomSlides.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        #{idx + 1} {s.imageUrl.length > 46 ? `${s.imageUrl.slice(0, 46)}...` : s.imageUrl}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!roomIdForUpload || !activeDraft || activeDraft === roomActiveSlideId}
                  onClick={async () => {
                    try {
                      await setRoomActiveSlide(token, roomIdForUpload, { slideId: activeDraft });
                      setRoomActiveSlideId(activeDraft);
                      setMsg("표시 지정 완료");
                      const roomRes = await getRoomSlides(token, roomIdForUpload);
                      setRoomSlides(roomRes.slides || []);
                      setRoomActiveSlideId(roomRes.activeSlideId || "");
                      setActiveDraft(roomRes.activeSlideId || "");
                    } catch (e) {
                      setMsg(e.message || "표시 지정 실패");
                    }
                  }}
                >
                  표시 지정
                </button>

                <div style={{ maxHeight: 260, overflow: "auto", marginTop: 10 }}>
                  {roomSlides.map((s, idx) => (
                    <div key={s.id} style={{ marginBottom: 12 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        #{idx + 1} {s.caption ? `(${s.caption})` : ""} {s.id === roomActiveSlideId ? " [현재]" : ""}
                      </div>
                      <div className="code">{s.imageUrl}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

