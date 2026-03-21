import React, { useState } from "react";
import { loginAdmin } from "../api.js";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await loginAdmin({ username, password });
      localStorage.setItem("adminToken", token);
      window.location.href = "/admin/dashboard";
    } catch (err) {
      setError(err?.message || "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>관리자 로그인</h1>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button disabled={loading} type="submit">
          {loading ? "확인중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}

