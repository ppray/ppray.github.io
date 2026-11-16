// Markdown and KaTeX renderer from the probability review handout.
function chEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* LaTeX 希腊字母 / 运算符 映射 */
var TEXGK={alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',vartheta:'ϑ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',omicron:'ο',pi:'π',varpi:'ϖ',rho:'ρ',varrho:'ϱ',sigma:'σ',varsigma:'ς',tau:'τ',upsilon:'υ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω'};
var TEXOP={times:'×',cdot:'·',div:'÷',pm:'±',mp:'∓',ast:'∗',star:'⋆',bullet:'•',leq:'≤',le:'≤',geqslant:'≥',leqslant:'≤',geq:'≥',ge:'≥',neq:'≠',ne:'≠',approx:'≈',equiv:'≡',cong:'≅',simeq:'≃',sim:'∼',propto:'∝',to:'→',rightarrow:'→',longrightarrow:'→',Rightarrow:'⇒',Leftarrow:'⇐',leftarrow:'←',Leftrightarrow:'⇔',leftrightarrow:'↔',mapsto:'↦',infty:'∞',circ:'°',degree:'°',deg:'°',angle:'∠',perp:'⊥',parallel:'∥',mid:'∣',nmid:'∤',setminus:'∖',colon:':',partial:'∂',nabla:'∇',sum:'∑',prod:'∏',int:'∫',oint:'∮',in:'∈',notin:'∉',ni:'∋',cup:'∪',cap:'∩',subset:'⊂',supset:'⊃',subseteq:'⊆',emptyset:'∅',forall:'∀',exists:'∃',ldots:'…',cdots:'⋯',dots:'…',vdots:'⋮',prime:'′',cdotp:'·',quad:' ',qquad:'  ',neg:'¬',land:'∧',lor:'∨',Re:'ℜ',Im:'ℑ',hbar:'ℏ',ell:'ℓ'};
var TEXALL={};(function(){for(var k in TEXGK)TEXALL[k]=TEXGK[k];for(var k2 in TEXOP)TEXALL[k2]=TEXOP[k2];})();
var TEXKEYS=Object.keys(TEXALL).sort(function(a,b){return b.length-a.length;});
var TEXRE=new RegExp('\\\\('+TEXKEYS.join('|')+')','g');
/* 把一段 LaTeX 数学转成纯 HTML(无需 MathJax/CDN) */
function texToHtml(s){
 var i;
 s=s.replace(/\\(?:boxed|mathring)\s*\{([^{}]*)\}/g,'$1');
 s=s.replace(/_\{([^{}]*)\}/g,'<sub>$1</sub>').replace(/\^\{([^{}]*)\}/g,'<sup>$1</sup>');
 s=s.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathcal|operatorname|overline|vec|bar|hat|tilde)\s*\{([^{}]*)\}/g,'$1');
 for(i=0;i<8;i++){s=s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,'<span class="cfrac"><span class="cn">$1</span><span class="cd">$2</span></span>');}
 s=s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g,'<sup>$1</sup>√<span class="csqrt">$2</span>');
 s=s.replace(/\\sqrt\s*\{([^{}]*)\}/g,'√<span class="csqrt">$1</span>');
 s=s.replace(/\\sqrt/g,'√');
 s=s.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathcal|operatorname|overline|vec|bar|hat|tilde)\s*\{([^{}]*)\}/g,'$1');
 s=s.replace(/\\left\s*([\(\)\[\]\|\.\/])?/g,function(m,p){return (p&&p!=='.')?p:'';});
 s=s.replace(/\\right\s*([\(\)\[\]\|\.\/])?/g,function(m,p){return (p&&p!=='.')?p:'';});
 s=s.replace(/\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|lg|exp|lim|max|min|gcd|mod|arg)\b/g,'$1');
 s=s.replace(TEXRE,function(m,n){return TEXALL[n];});
 s=s.replace(/_([A-Za-z0-9])/g,'<sub>$1</sub>').replace(/\^([A-Za-z0-9°*+\-])/g,'<sup>$1</sup>');
 s=s.replace(/\\,|\\;|\\:|\\ /g,' ').replace(/\\!/g,'').replace(/\\\\/g,'<br>');
 s=s.replace(/[{}]/g,'').replace(/\\/g,'');
 return s;}
function mdLite(t){t=chEsc(t.replace(/\r\n?/g,'\n')).replace(/\uE000/g,'&#57344;');
 var keep=[];
 function hold(html){return '\uE000'+(keep.push(html)-1)+'\uE001';}
 t=t.replace(/^```[^\n]*\n([\s\S]*?)(?:^[ \t]*```[ \t]*$|(?![\s\S]))/gm,function(m,c){return hold('<pre><code>'+c.replace(/\n$/,'')+'</code></pre>');});
 t=t.replace(/`([^`\n]+)`/g,function(m,c){return hold('<code>'+c+'</code>');});
 /* 数学公式:用离线内嵌的 KaTeX 渲染,任何合法 LaTeX 都能正确显示 */
 function kk(x,disp){var latex=x.replace(/&(amp|lt|gt);/g,function(m,key){return {amp:'&',lt:'<',gt:'>'}[key];});try{if(typeof katex!=='undefined')return katex.renderToString(latex,{displayMode:disp,throwOnError:false,strict:false,trust:false});}catch(e){}return '<span class="cmath">'+texToHtml(x)+'</span>';}
 t=t.replace(/\$\$([\s\S]+?)\$\$/g,function(m,x){return hold(kk(x,true));});
 t=t.replace(/\\\[([\s\S]+?)\\\]/g,function(m,x){return hold(kk(x,true));});
 t=t.replace(/\\\(([\s\S]+?)\\\)/g,function(m,x){return hold(kk(x,false));});
 t=t.replace(/\$([^$\n]+?)\$/g,function(m,x){return hold(kk(x,false));});
 /* 兜底:DeepSeek 有时不加美元号就直接写 \begin{cases}...\end{cases} 等环境,也用 KaTeX 渲染 */
 t=t.replace(/\\begin\{([a-zA-Z]+\*?)\}[\s\S]*?\\end\{\1\}/g,function(m){return hold(kk(m,true));});
 var L=t.split('\n'),o=[],ul=false,ol=false;
 function cl(){if(ul){o.push('</ul>');ul=false;}if(ol){o.push('</ol>');ol=false;}}
 function tcell(r){return r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|');}
 for(var i=0;i<L.length;i++){var ln=L[i];
  if(/\|/.test(ln)&&i+1<L.length&&L[i+1].indexOf('|')>=0&&/^[\s|:\-]+$/.test(L[i+1])&&/-/.test(L[i+1])){
   cl();var hd=tcell(ln),tb='<div class="ctabwrap"><table class="ctab"><thead><tr>',c;
   for(c=0;c<hd.length;c++)tb+='<th>'+hd[c].trim()+'</th>';
   tb+='</tr></thead><tbody>';i+=2;
   while(i<L.length&&L[i].indexOf('|')>=0&&L[i].trim()!==''){var rc=tcell(L[i]);tb+='<tr>';for(c=0;c<rc.length;c++)tb+='<td>'+rc[c].trim()+'</td>';tb+='</tr>';i++;}
   i--;o.push(tb+'</tbody></table></div>');continue;}
  var h=ln.match(/^\s*(#{1,4})\s+(.*)$/);if(h){cl();o.push('<div class="cmh">'+h[2]+'</div>');continue;}
  var u=ln.match(/^\s*[-*+]\s+(.*)$/);if(u){if(ol){o.push('</ol>');ol=false;}if(!ul){o.push('<ul>');ul=true;}o.push('<li>'+u[1]+'</li>');continue;}
  var n=ln.match(/^\s*\d+[.)]\s+(.*)$/);if(n){if(ul){o.push('</ul>');ul=false;}if(!ol){o.push('<ol>');ol=true;}o.push('<li>'+n[1]+'</li>');continue;}
  cl();o.push(ln);}
 cl();t=o.join('\n');
 t=t.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>');
 t=t.replace(/([A-Za-z0-9\)\]])_([A-Za-z0-9]{1,4})\b/g,'$1<sub>$2</sub>').replace(/([A-Za-z0-9\)\]])\^([0-9A-Za-z°\-+]{1,3})/g,'$1<sup>$2</sup>');
 t=t.replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>');
 t=t.replace(/<br>\s*(<(?:ul|ol|li|pre|table|div class="(?:cmh|ctabwrap)"))/g,'$1').replace(/(<\/(?:ul|ol|li|pre|table)>|<\/div>)\s*<br>/g,'$1');
 t=t.replace(/\uE000(\d+)\uE001/g,function(m,j){return keep[+j];});
 return t;}
