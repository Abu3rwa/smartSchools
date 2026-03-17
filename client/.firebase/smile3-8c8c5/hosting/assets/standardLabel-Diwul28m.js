const i=(l,u,t)=>{let e=null,n=null;return l&&typeof l=="object"?(e=l.code??null,n=l.description??l.name??null):(e=l??null,n=u??null),e&&n?`${e} : ${n}`:e||n||""};export{i as f};
