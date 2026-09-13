let items = [];
const $ = s => document.querySelector(s);
const won = n => new Intl.NumberFormat('ko-KR').format(Number(n) || 0) + '원';

if (location.protocol === 'file:') {
  const message = '관리자 기능은 서버 실행이 필요합니다. 폴더의 start.bat를 실행한 뒤 http://localhost:3000/admin 에 접속해주세요.';
  const err = document.querySelector('#loginError');
  if (err) err.textContent = message;
}

async function api(url, options={}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers||{}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
  return data;
}

async function init() {
  try {
    const session = await api('/api/admin/session');
    if (session.authenticated) showAdmin();
  } catch (_) {}
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (location.protocol === 'file:') {
    $('#loginError').textContent='start.bat를 실행한 뒤 http://localhost:3000/admin 에서 로그인해주세요.';
    return;
  }
  $('#loginError').textContent='';
  const button = e.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});
    $('#password').value='';
    await showAdmin();
  } catch(err) {
    $('#loginError').textContent=err.message;
  } finally {
    button.disabled = false;
  }
});

async function showAdmin(){
  $('#loginView').classList.add('hidden');
  $('#adminView').classList.remove('hidden');
  await refresh();
}

async function refresh(){
  const data=await api('/api/admin/items');
  items=data.items||[];
  renderList();
}

function renderList(){
  $('#countLabel').textContent=items.length;
  $('#itemList').innerHTML=items.length ? items.map(item=>`
    <article class="inventory-card">
      <div class="inventory-thumb">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">` : '<span>NO IMAGE</span>'}</div>
      <div class="inventory-content">
        <div class="inventory-name-row"><strong>${esc(item.name)}</strong><span>${won(item.price)}</span></div>
        <p>${esc(item.description || '설명 없음')}</p>
        <div class="inventory-bottom"><span class="mini-stock">재고 ${item.quantity}개</span><div class="item-actions"><button class="mini-button edit" data-id="${item.id}" type="button">수정</button><button class="mini-button danger del" data-id="${item.id}" type="button">삭제</button></div></div>
      </div>
    </article>`).join('') : '<div class="admin-empty"><strong>등록된 상품이 없습니다.</strong><span>왼쪽 폼에서 첫 아이템을 추가해보세요.</span></div>';
  document.querySelectorAll('.edit').forEach(b=>b.addEventListener('click',()=>startEdit(b.dataset.id)));
  document.querySelectorAll('.del').forEach(b=>b.addEventListener('click',()=>removeItem(b.dataset.id)));
}

function startEdit(id){
  const item=items.find(i=>i.id===id);
  if(!item)return;
  $('#itemId').value=item.id;
  $('#name').value=item.name;
  $('#quantity').value=item.quantity;
  $('#price').value=item.price;
  $('#image').value=item.image||'';
  $('#description').value=item.description||'';
  $('#details').value=item.details||'';
  $('#formHeading').textContent='아이템 수정';
  $('#submitBtn').innerHTML='수정 내용 저장 <span>→</span>';
  $('#cancelEdit').classList.remove('hidden');
  updatePreview();
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetForm(){
  $('#itemForm').reset();
  $('#itemId').value='';
  $('#quantity').value=1;
  $('#formHeading').textContent='새 아이템 추가';
  $('#submitBtn').innerHTML='아이템 등록 <span>→</span>';
  $('#cancelEdit').classList.add('hidden');
  $('#formError').textContent='';
  $('#imagePreviewWrap').classList.add('hidden');
}

function updatePreview(){
  const url=$('#image').value.trim();
  if(!url){ $('#imagePreviewWrap').classList.add('hidden'); return; }
  $('#imagePreview').src=url;
  $('#imagePreviewWrap').classList.remove('hidden');
}

$('#imageFile').addEventListener('change', async () => {
  const file = $('#imageFile').files[0];
  if (!file) return;
  $('#formError').textContent = '';
  const fd = new FormData();
  fd.append('image', file);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '사진 업로드에 실패했습니다.');
    $('#image').value = data.url;
    updatePreview();
  } catch (err) { $('#formError').textContent = err.message; }
});
$('#imagePreview').addEventListener('error',()=>$('#imagePreviewWrap').classList.add('hidden'));
$('#cancelEdit').addEventListener('click', resetForm);

$('#itemForm').addEventListener('submit', async e=>{
  e.preventDefault();
  $('#formError').textContent='';
  const id=$('#itemId').value;
  const payload={name:$('#name').value,quantity:$('#quantity').value,price:$('#price').value,image:$('#image').value,description:$('#description').value,details:$('#details').value};
  const button=$('#submitBtn');
  button.disabled=true;
  try{
    await api(id?`/api/admin/items/${id}`:'/api/admin/items',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    resetForm();
    await refresh();
  }catch(err){
    $('#formError').textContent=err.message;
  }finally{ button.disabled=false; }
});

async function removeItem(id){
  if(!confirm('이 아이템을 삭제할까요?'))return;
  try{ await api(`/api/admin/items/${id}`,{method:'DELETE'}); await refresh(); }
  catch(err){ alert(err.message); }
}

$('#logoutBtn').addEventListener('click',async()=>{ await api('/api/admin/logout',{method:'POST'}); location.reload(); });
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
init();
