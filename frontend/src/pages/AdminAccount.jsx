import React, { useState } from "react";
import { Link } from "react-router-dom";
import { changeAdminPassword } from "../api.js";

export default function AdminAccount() {
  const token = localStorage.getItem("adminToken");

  const [msg, setMsg] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwNext2, setPwNext2] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="page page--full">
      <div className="topbar">
        <h1>계정 관리</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="code" to="/admin/dashboard">
            대시보드로
          </Link>
        </div>
      </div>

      {msg ? <div className="notice">{msg}</div> : null}

      <section className="admin-section">
        <h2 className="admin-section-title">비밀번호 변경</h2>
        <div className="grid">
          <div className="card wide">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setMsg("");
                if (!token) {
                  setMsg("로그인이 필요합니다.");
                  return;
                }
                const cur = pwCurrent;
                const next = pwNext;
                const next2 = pwNext2;
                if (!cur || !next || !next2) {
                  setMsg("현재 비밀번호/새 비밀번호/새 비밀번호 확인을 모두 입력하세요.");
                  return;
                }
                if (next !== next2) {
                  setMsg("새 비밀번호 확인이 일치하지 않습니다.");
                  return;
                }
                setLoading(true);
                try {
                  await changeAdminPassword(token, { currentPassword: cur, newPassword: next });
                  setPwCurrent("");
                  setPwNext("");
                  setPwNext2("");
                  setMsg("비밀번호가 변경되었습니다.");
                } catch (err) {
                  setMsg(err.message || "비밀번호 변경 실패");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <label className="field">
                <span>현재 비밀번호</span>
                <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
              </label>
              <label className="field">
                <span>새 비밀번호</span>
                <input type="password" value={pwNext} onChange={(e) => setPwNext(e.target.value)} autoComplete="new-password" />
              </label>
              <label className="field">
                <span>새 비밀번호 확인</span>
                <input type="password" value={pwNext2} onChange={(e) => setPwNext2(e.target.value)} autoComplete="new-password" />
              </label>
              <button type="submit" disabled={!token || loading}>
                {loading ? "변경 중..." : "변경"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

