const auth={status:'loading',user:null,mode:'signin',step:'password',busy:false,error:'',success:'',email:'',password:'',code:'',returnTo:'map'};
const accountHash=email=>{let n=2166136261;for(const c of String(email).trim().toLowerCase()){n=Math.imul(n^c.charCodeAt(0),16777619)}return (n>>>0).toString(16)};
const progressStore=()=>auth.user?STORE+':account:'+accountHash(auth.user.email):STORE;
