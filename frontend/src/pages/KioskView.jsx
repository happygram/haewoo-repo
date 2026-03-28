import React, { useEffect, useMemo, useRef, useState } from "react";
import { getKioskRoomConfig } from "../api.js";

export default function KioskView() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const roomId = params.get("roomId") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCaption, setShowCaption] = useState(false);
  const [displaySize, setDisplaySize] = useState("INCH24");
  const [activeSlide, setActiveSlide] = useState(null);

  const showHanjaCaption =
    Boolean(showCaption && displaySize !== "INCH24" && activeSlide?.caption && !activeSlide?.religion);
  const showRestStrip =
    Boolean(showCaption && displaySize !== "INCH24" && activeSlide?.religion);

  const restMainPhotoRef = useRef(null);
  const [restPhotoWidthPx, setRestPhotoWidthPx] = useState(null);

  useEffect(() => {
    if (!showRestStrip) {
      setRestPhotoWidthPx(null);
      return;
    }
    const el = restMainPhotoRef.current;
    if (!el) return;
    const update = () => setRestPhotoWidthPx(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("load", update);
    return () => {
      ro.disconnect();
      el.removeEventListener("load", update);
    };
  }, [showRestStrip, activeSlide?.imageUrl]);

  async function refresh() {
    if (roomId) {
      setError("");
      setLoading(true);
      try {
        const res = await getKioskRoomConfig({ roomId });
        setShowCaption(Boolean(res.ui?.showCaption));
        const ds = res.ui?.displaySize;
        setDisplaySize(ds === "INCH32" ? "INCH32" : ds === "INCH24" ? "INCH24" : "INCH27");
        setActiveSlide(res.activeSlide || null);
        setLoading(false);
        return;
      } catch (e) {
        setError(e.message || "가져오기 실패");
        setLoading(false);
        return;
      }
    }
    setError("roomId가 URL에 필요합니다.");
    setLoading(false);
  }

  // 초기 + 주기적 갱신(관리자가 사진/시간을 바꿔도 키오스크가 따라오게)
  useEffect(() => {
    refresh();
    const t = window.setInterval(() => refresh(), 10000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const kioskClass =
    displaySize === "INCH32"
      ? "kiosk kiosk--inch32"
      : displaySize === "INCH24"
        ? "kiosk kiosk--inch24"
        : "kiosk kiosk--inch27";

  return (
    <div className={kioskClass}>
      {error ? <div className="kiosk-error">{error}</div> : null}

      {activeSlide?.imageUrl ? (
        <div className="frame">
          {showRestStrip ? (
            <>
              <div className="kiosk-img-wrap">
                <img ref={restMainPhotoRef} className="bg" src={activeSlide.imageUrl} alt="" />
              </div>
              <div className="kiosk-rest-strip" aria-hidden>
                <img
                  className="kiosk-rest-img"
                  src="/rest-01.jpg"
                  alt=""
                  style={
                    restPhotoWidthPx != null && restPhotoWidthPx > 0
                      ? { width: restPhotoWidthPx, maxWidth: restPhotoWidthPx }
                      : undefined
                  }
                />
              </div>
            </>
          ) : (
            <>
              {showHanjaCaption ? (
                <div className="caption">
                  <div className="caption-inner">
                    <div className="caption-name">
                      <span className="hanja">故</span>
                      <span className="name-text">{activeSlide.caption}</span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="kiosk-img-wrap">
                <img className="bg" src={activeSlide.imageUrl} alt="" />
              </div>
            </>
          )}
        </div>
      ) : roomId && !error ? (
        <div className="frame kiosk-frame--no-photo">
          <div className="kiosk-img-wrap">
            <img className="bg" src="/rest-02.jpg" alt="" />
          </div>
          {loading ? <div className="kiosk-fallback-loading">로딩 중...</div> : null}
        </div>
      ) : (
        <div className="placeholder">
          <div className="placeholder-text">{loading ? "로딩 중..." : "표시할 사진이 없습니다."}</div>
        </div>
      )}
    </div>
  );
}
