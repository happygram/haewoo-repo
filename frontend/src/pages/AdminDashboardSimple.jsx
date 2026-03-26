import React, { useEffect, useMemo, useState } from "react";
import {
  createHall,
  createRoom,
  deleteHall,
  deleteRoom,
  deleteSlide,
  getHalls,
  getRoomSlides,
  setRoomActiveSlide,
  updateHall,
  updateRoom,
  uploadSlide,
} from "../api.js";

function isEntityActive(x) {
  return x == null || x.isActive !== false;
}

export default function AdminDashboardSimple() {
  const token = localStorage.getItem("adminToken");

  const [halls, setHalls] = useState([]);
  const allRooms = useMemo(() => halls.flatMap((h) => h.rooms || []), [halls]);
  const hallsDesc = useMemo(() => {
    return [...halls].sort((a, b) => {
      const an = a?.name || "";
      const bn = b?.name || "";
      return an.localeCompare(bn, "ko");
    });
  }, [halls]);

  const hallsSelectable = useMemo(() => hallsDesc.filter(isEntityActive), [hallsDesc]);

  // 1) 장례식장 생성
  const [newHallName, setNewHallName] = useState("");

  // 2) 빈소 생성
  const [roomHallId, setRoomHallId] = useState("");
  const [roomName, setRoomName] = useState("");

  // 관리: 장례식장
  const [hallManageId, setHallManageId] = useState("");
  const [hallManageName, setHallManageName] = useState("");

  // 관리: 빈소
  const [roomManageHallId, setRoomManageHallId] = useState("");
  const [roomManageId, setRoomManageId] = useState("");
  const [roomManageName, setRoomManageName] = useState("");
  const [roomManageDisplaySize, setRoomManageDisplaySize] = useState("INCH24");

  // 5) 사진 업로드
  const [uploadHallId, setUploadHallId] = useState("");
  const roomsInUploadHall = useMemo(
    () =>
      [...allRooms]
        .filter((r) => r.hallId === uploadHallId && isEntityActive(r))
        .sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "ko")),
    [allRooms, uploadHallId]
  );
  const [roomIdForUpload, setRoomIdForUpload] = useState("");
  const [uploadInch, setUploadInch] = useState("INCH24");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState([]);

  useEffect(() => {
    // INCH24는 하단 텍스트(故 이름) 영역을 표시하지 않으므로, 이전에 입력한 값이 업로드에 섞이지 않게 합니다.
    if (uploadInch === "INCH24") setCaption("");
  }, [uploadInch]);

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

  const selectedManageRoom = useMemo(() => allRooms.find((r) => r.id === roomManageId) || null, [allRooms, roomManageId]);
  const selectedUploadRoom = useMemo(
    () => allRooms.find((r) => r.id === roomIdForUpload) || null,
    [allRooms, roomIdForUpload]
  );

  const roomsInManageHall = useMemo(
    () =>
      [...allRooms]
        .filter((r) => r.hallId === roomManageHallId)
        .sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "ko")),
    [allRooms, roomManageHallId]
  );

  useEffect(() => {
    refresh().catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    if (!roomHallId && hallsSelectable.length > 0) setRoomHallId(hallsSelectable[0].id);
    if (hallsSelectable.length > 0 && !hallsSelectable.some((h) => h.id === roomHallId)) {
      setRoomHallId(hallsSelectable[0].id);
    }
  }, [hallsSelectable, roomHallId]);

  useEffect(() => {
    if (!uploadHallId && hallsSelectable.length > 0) setUploadHallId(hallsSelectable[0].id);
    if (hallsSelectable.length > 0 && !hallsSelectable.some((h) => h.id === uploadHallId)) {
      setUploadHallId(hallsSelectable[0].id);
    }
  }, [hallsSelectable, uploadHallId]);

  useEffect(() => {
    if (!hallManageId && hallsDesc.length > 0) setHallManageId(hallsDesc[0].id);
    if (hallsDesc.length > 0 && !hallsDesc.some((h) => h.id === hallManageId)) {
      setHallManageId(hallsDesc[0].id);
    }
  }, [hallsDesc, hallManageId]);

  useEffect(() => {
    const h = hallsDesc.find((x) => x.id === hallManageId);
    if (h) setHallManageName(h.name || "");
  }, [hallManageId, hallsDesc]);

  useEffect(() => {
    if (!roomManageHallId && hallsDesc.length > 0) setRoomManageHallId(hallsDesc[0].id);
    if (hallsDesc.length > 0 && !hallsDesc.some((h) => h.id === roomManageHallId)) {
      setRoomManageHallId(hallsDesc[0].id);
    }
  }, [hallsDesc, roomManageHallId]);

  useEffect(() => {
    if (roomsInManageHall.length > 0 && !roomsInManageHall.some((r) => r.id === roomManageId)) {
      setRoomManageId(roomsInManageHall[0].id);
    }
    if (roomsInManageHall.length === 0) setRoomManageId("");
  }, [roomsInManageHall, roomManageId]);

  useEffect(() => {
    const r = allRooms.find((x) => x.id === roomManageId);
    if (r) {
      setRoomManageName(r.name || "");
      setRoomManageDisplaySize(r.displaySize || "INCH27");
    }
  }, [roomManageId, allRooms]);

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
    setHallManageId(res.hall?.id || hallManageId);
    setMsg(`장례식장 생성 완료: ${res.hall?.name || ""}`);
  }

  async function onCreateRoom(e) {
    e.preventDefault();
    setMsg("");
    if (!roomHallId || !roomName.trim()) return;
    const res = await createRoom(token, { hallId: roomHallId, name: roomName });
    setRoomName("");
    await refresh();
    setRoomManageHallId(roomHallId);
    setRoomManageId(res.room?.id || "");
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

    const captionTrimmed = caption.trim();
    const applyCaption = captionTrimmed || null;

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

  async function reloadSlidesForCurrentRoom() {
    const roomRes = await getRoomSlides(token, roomIdForUpload);
    const slides = roomRes.slides || [];
    const active = roomRes.activeSlideId || "";
    setRoomSlides(slides);
    setRoomActiveSlideId(active);
    setActiveDraft(active || (slides[0] ? slides[0].id : ""));
  }

  return (
    <div className="page page--full">
      <div className="topbar">
        <h1>관리자 대시보드</h1>
      </div>
      {msg ? <div className="notice">{msg}</div> : null}

      <section className="admin-section">
        <h2 className="admin-section-title">장례식장</h2>
        <div className="grid layout-band--halls">
          <div className="card">
            <h3 className="card-title">생성</h3>
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
          <h3 className="card-title">수정·비활성·삭제</h3>
          <label className="field">
            <span>장례식장</span>
            <select value={hallManageId} onChange={(e) => setHallManageId(e.target.value)}>
              {hallsDesc.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive === false ? " [비활성]" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>이름</span>
            <input value={hallManageName} onChange={(e) => setHallManageName(e.target.value)} />
          </label>
          <div className="btn-row">
            <button
              type="button"
              disabled={!hallManageId || !hallManageName.trim()}
              onClick={async () => {
                try {
                  await updateHall(token, hallManageId, { name: hallManageName.trim() });
                  setMsg("장례식장 이름 저장됨");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "저장 실패");
                }
              }}
            >
              이름 저장
            </button>
            <button
              type="button"
              disabled={!hallManageId}
              onClick={async () => {
                const h = hallsDesc.find((x) => x.id === hallManageId);
                const currentlyActive = Boolean(h && h.isActive !== false);
                const next = !currentlyActive;
                if (currentlyActive) {
                  if (
                    !window.confirm(
                      "장례식장을 비활성화할까요?\n소속 빈소도 함께 비활성화되며, 해당 빈소 키오스크 표시가 중단됩니다."
                    )
                  ) {
                    return;
                  }
                }
                try {
                  await updateHall(token, hallManageId, { isActive: next });
                  setMsg(next ? "장례식장 활성화됨" : "장례식장 비활성화됨 (소속 빈소도 비활성)");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "처리 실패");
                }
              }}
            >
              {hallsDesc.find((x) => x.id === hallManageId)?.isActive === false ? "활성화" : "비활성화"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!hallManageId}
              onClick={async () => {
                if (!window.confirm("이 장례식장과 소속 빈소·이미지를 모두 삭제할까요? (복구 불가)")) return;
                try {
                  await deleteHall(token, hallManageId);
                  setMsg("장례식장 삭제됨");
                  setHallManageId("");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "삭제 실패");
                }
              }}
            >
              삭제
            </button>
          </div>
        </div>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">빈소</h2>
        <div className="grid layout-band--rooms">
          <div className="card">
            <h3 className="card-title">생성</h3>
            <form onSubmit={onCreateRoom}>
            <label className="field">
              <span>장례식장</span>
              <select
                value={roomHallId}
                onChange={(e) => {
                  const next = e.target.value;
                  setRoomHallId(next);
                  setUploadHallId(next);
                }}
              >
                {hallsSelectable.map((h) => (
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

        <div className="card">
          <h3 className="card-title">수정·비활성·삭제</h3>
          <label className="field">
            <span>장례식장</span>
            <select value={roomManageHallId} onChange={(e) => setRoomManageHallId(e.target.value)}>
              {hallsDesc.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive === false ? " [비활성]" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>빈소</span>
            <select value={roomManageId} onChange={(e) => setRoomManageId(e.target.value)} disabled={roomsInManageHall.length === 0}>
              {roomsInManageHall.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isActive === false ? " [비활성]" : ""}
                </option>
              ))}
            </select>
          </label>
          {selectedManageRoom ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              선택한 빈소 표시 인치: {selectedManageRoom.displaySize}
            </div>
          ) : null}
          <label className="field">
            <span>이름</span>
            <input value={roomManageName} onChange={(e) => setRoomManageName(e.target.value)} disabled={!roomManageId} />
          </label>
          <label className="field">
            <span>표시 인치</span>
            <select value={roomManageDisplaySize} onChange={(e) => setRoomManageDisplaySize(e.target.value)} disabled={!roomManageId}>
              <option value="INCH24">24인치</option>
              <option value="INCH27">27인치</option>
              <option value="INCH32">32인치</option>
            </select>
          </label>
          <div className="btn-row">
            <button
              type="button"
              disabled={!roomManageId || !roomManageName.trim()}
              onClick={async () => {
                try {
                  await updateRoom(token, roomManageId, {
                    name: roomManageName.trim(),
                    displaySize: roomManageDisplaySize,
                  });
                  setMsg("빈소 정보 저장됨");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "저장 실패");
                }
              }}
            >
              저장
            </button>
            <button
              type="button"
              disabled={!roomManageId}
              onClick={async () => {
                const r = allRooms.find((x) => x.id === roomManageId);
                const currentlyActive = Boolean(r && r.isActive !== false);
                const next = !currentlyActive;
                if (currentlyActive) {
                  if (!window.confirm("빈소를 비활성화할까요?\n키오스크 표시가 중단됩니다.")) {
                    return;
                  }
                }
                try {
                  await updateRoom(token, roomManageId, { isActive: next });
                  setMsg(next ? "빈소 활성화됨" : "빈소 비활성화됨");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "처리 실패");
                }
              }}
            >
              {allRooms.find((x) => x.id === roomManageId)?.isActive === false ? "활성화" : "비활성화"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!roomManageId}
              onClick={async () => {
                if (!window.confirm("이 빈소의 이미지를 모두 삭제하고 빈소를 없앨까요? (복구 불가)")) return;
                try {
                  await deleteRoom(token, roomManageId);
                  setMsg("빈소 삭제됨");
                  setRoomManageId("");
                  await refresh();
                } catch (e) {
                  setMsg(e.message || "삭제 실패");
                }
              }}
            >
              삭제
            </button>
          </div>
        </div>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">사진 업로드</h2>
        <div className="grid">
          <div className="card wide">
          {hallsSelectable.length === 0 ? (
            <div className="error">활성화된 장례식장이 없습니다. 위에서 장례식장을 만들거나 비활성을 해제하세요.</div>
          ) : null}
          <form onSubmit={onUpload}>
            <label className="field">
              <span>장례식장</span>
              <select value={uploadHallId} onChange={(e) => setUploadHallId(e.target.value)} disabled={hallsSelectable.length === 0}>
                {hallsSelectable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>빈소</span>
              <select
                value={roomIdForUpload}
                onChange={(e) => setRoomIdForUpload(e.target.value)}
                disabled={roomsInUploadHall.length === 0}
              >
                {roomsInUploadHall.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            {roomIdForUpload ? (
              <div className="muted" style={{ marginTop: 8 }}>
                키오스크 접속 URL (클릭 시 새 탭):
                <a
                  className="code"
                  href={`${window.location.origin}/kiosk?roomId=${encodeURIComponent(roomIdForUpload)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {`${window.location.origin}/kiosk?roomId=${roomIdForUpload}`}
                </a>
              </div>
            ) : null}
            {selectedUploadRoom ? (
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                선택한 빈소 표시 인치: {selectedUploadRoom.displaySize}
              </div>
            ) : null}
            <label className="field">
              <span>인치</span>
              <select value={uploadInch} onChange={(e) => setUploadInch(e.target.value)}>
                <option value="INCH24">24인치 (하단 텍스트 미표시)</option>
                <option value="INCH27">27인치 (키오스크 하단에 텍스트 표시)</option>
                <option value="INCH32">32인치 (키오스크 하단에 텍스트 표시)</option>
              </select>
            </label>
            {uploadInch === "INCH24" ? null : (
              <label className="field field--top">
                <span>故(고) 이름</span>
                <textarea
                  className="field-textarea"
                  rows={3}
                  lang="ko"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="예: 홍길동 (키오스크 하단에 '故 홍길동'으로 표시됩니다)"
                  autoComplete="off"
                />
              </label>
            )}
            <label className="field">
              <span>사진 파일</span>
              <input type="file" multiple accept="image/*" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </label>
            <button type="submit" disabled={!roomIdForUpload || !files || files.length === 0 || hallsSelectable.length === 0}>
              업로드
            </button>
          </form>

          <div style={{ marginTop: 18 }}>
            <h3 className="upload-subtitle">저장된 이미지 URL 목록</h3>

            {roomSlidesError ? <div className="error">{roomSlidesError}</div> : null}
            {activeImageUrl ? (
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  키오스크에서 현재 표시할 URL (클릭 시 새 탭)
                </div>
                <a className="code" href={activeImageUrl} target="_blank" rel="noopener noreferrer">
                  {activeImageUrl}
                </a>
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

                <div style={{ maxHeight: "min(42vh, 480px)", overflow: "auto", marginTop: 10 }}>
                  {roomSlides.map((s, idx) => (
                    <div key={s.id} style={{ marginBottom: 12 }}>
                      <div className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span>
                          #{idx + 1} {s.caption ? `(${s.caption})` : ""} {s.id === roomActiveSlideId ? " [현재]" : ""}
                        </span>
                        <button
                          type="button"
                          className="danger"
                          style={{ marginTop: 0 }}
                          onClick={async () => {
                            if (!window.confirm("이 이미지를 삭제할까요? S3 파일도 함께 삭제됩니다.")) return;
                            try {
                              await deleteSlide(token, roomIdForUpload, s.id);
                              setMsg("이미지 삭제됨");
                              await refresh();
                              await reloadSlidesForCurrentRoom();
                            } catch (e) {
                              setMsg(e.message || "삭제 실패");
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                      <a className="code" href={s.imageUrl} target="_blank" rel="noopener noreferrer">
                        {s.imageUrl}
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </section>
    </div>
  );
}
