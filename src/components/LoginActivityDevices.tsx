import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "../styles/device_activity.css";

type Row = { session_id:string; account_email:string; role:string; browser:string; os:string; device_type:string; login_at:string; last_active:string; is_current:boolean };

const dateText = (value:string) => new Intl.DateTimeFormat("en-PH", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Manila" }).format(new Date(value));

export default function LoginActivityDevices() {
  const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const role=(localStorage.getItem("role")||"").toLowerCase();
  const load=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.rpc("list_login_devices");if(error){setError(/list_login_devices|schema cache/i.test(error.message)?"Run the Login Activity SQL migration in Supabase first.":error.message);setRows([]);}else{setRows((data||[]) as Row[]);setError("");}setLoading(false);},[]);
  useEffect(()=>{void load();const id=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(id);},[load]);
  const logout=async(row:Row,all=false)=>{if(!window.confirm(all?`Log out all devices for ${row.account_email}?`:"Log out this device?"))return;const {error}=await supabase.rpc(all?"logout_all_login_devices":"logout_login_device",all?{p_email:row.account_email}:{p_session_id:row.session_id});if(error)setError(error.message);else void load();};
  return <section className="devices-page"><header><div><small>SECURITY</small><h1>Login Activity & Devices</h1><p>See where your account is logged in and remotely sign out sessions.</p></div><button onClick={()=>void load()}>Refresh</button></header>{error&&<div className="devices-error">{error}</div>}{loading?<p>Loading devices…</p>:<div className="devices-grid">{rows.length===0&&!error?<p>No device activity yet. Sign in again to register this browser.</p>:rows.map(r=><article key={r.session_id}><div className="device-title"><div><h3>{r.device_type} {r.is_current&&<em>This device</em>}</h3><p>{r.browser} · {r.os}</p></div><span>Active</span></div><dl><div><dt>Account</dt><dd>{r.account_email} ({r.role})</dd></div><div><dt>Logged in</dt><dd>{dateText(r.login_at)}</dd></div><div><dt>Last active</dt><dd>{dateText(r.last_active)}</dd></div><div><dt>Location</dt><dd>Unavailable</dd></div></dl><div className="device-buttons"><button className="danger" onClick={()=>void logout(r)}>Log out device</button>{role==="admin"&&<button onClick={()=>void logout(r,true)}>Log out all</button>}</div></article>)}</div>}<p className="devices-note">Remote logout cannot erase screenshots or information already saved on an offline device.</p></section>;
}
