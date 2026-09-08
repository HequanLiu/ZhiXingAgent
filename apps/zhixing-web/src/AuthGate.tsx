import {useEffect,useRef} from 'react';
import {Alert,Button,Form,Input,Spin} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {App} from './App';
export function AuthGate(){
 const client=useQueryClient();const session=useQuery({queryKey:['session'],queryFn:async()=>{const r=await fetch('/api/session');if(!r.ok)throw new Error('无法连接登录服务');return r.json();},refetchInterval:30000});
 const login=useMutation({mutationFn:async(body:unknown)=>{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(r.status===429?'尝试次数过多，请稍后重试':'登录失败，请检查租户、账号和密码');},onSuccess:()=>client.invalidateQueries({queryKey:['session']})});
 const identityKey=session.data?.demo?'demo':session.data?.authenticated?`${session.data.principal.tenant}:${session.data.principal.actor}`:'anonymous';
 const previous=useRef(identityKey);useEffect(()=>{if(previous.current!==identityKey){client.removeQueries({predicate:q=>q.queryKey[0]!=='session'});previous.current=identityKey;}},[identityKey,client]);
 if(session.isPending)return <Spin/>;if(session.isError)return <Alert type="error" title="无法连接登录服务" action={<Button onClick={()=>void session.refetch()}>重试</Button>}/>;
 if(session.data.demo||session.data.authenticated)return <App key={identityKey} identity={session.data.principal} onLogout={async()=>{await fetch('/api/logout',{method:'POST'});await client.cancelQueries();client.removeQueries({predicate:q=>q.queryKey[0]!=='session'});await client.invalidateQueries({queryKey:['session']});}}/>;
 return <div className="login-card"><h1>声研实验室</h1><p>使用已开通的企业账号登录。</p><Form layout="vertical" onFinish={v=>login.mutate(v)}><Form.Item name="tenant" label="租户" rules={[{required:true}]}><Input autoComplete="organization"/></Form.Item><Form.Item name="username" label="账号" rules={[{required:true}]}><Input autoComplete="username"/></Form.Item><Form.Item name="password" label="密码" rules={[{required:true}]}><Input.Password autoComplete="current-password"/></Form.Item>{login.isError&&<Alert type="error" title={login.error.message}/>}<Button type="primary" block htmlType="submit" loading={login.isPending}>登录</Button></Form></div>;
}
