const won = n => new Intl.NumberFormat('ko-KR').format(Number(n) || 0) + '원';
let store = { seller: {}, items: [] };
const grid = document.querySelector('#grid');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');

async function load() {
  try {
    if (location.protocol === 'file:') {
      store = {
        seller: { name: '판매자', openProfileUrl: '#' },
        items: [
          { id:'preview-1', name:'네온 블레이드', quantity:2, price:15000, image:'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?auto=format&fit=crop&w=1200&q=80', description:'상태 좋음 · 즉시 거래 가능', details:'이 화면은 로컬 미리보기입니다. 실제 상품 관리는 start.bat로 서버를 실행한 뒤 관리자 페이지에서 할 수 있습니다.' },
          { id:'preview-2', name:'크롬 코어', quantity:5, price:8900, image:'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=80', description:'묶음 거래 가능 · 수량 협의 가능', details:'실제 서버로 실행하면 data.json과 관리자 페이지의 상품 정보가 표시됩니다.' }
        ]
      };
    } else {
      const res = await fetch('/api/store', { cache: 'no-store' });
      if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
      store = await res.json();
    }
    const sellerName = store.seller?.name || '판매자';
    document.querySelector('#sellerName').textContent = sellerName;
    document.querySelector('#sellerCardName').textContent = sellerName;
    document.querySelector('#footerSeller').textContent = sellerName;
    document.querySelector('#sellerAvatar').textContent = sellerName.trim().charAt(0).toUpperCase() || 'O';
    document.querySelector('#itemCountNumber').textContent = store.items.length;
    document.querySelector('#itemCount').textContent = `${store.items.length} items`;
    render();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><b>연결할 수 없습니다.</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function render() {
  if (!store.items.length) {
    grid.innerHTML = '<div class="empty-state"><b>아직 판매 중인 아이템이 없어요.</b><span>새 아이템이 등록되면 여기에 표시됩니다.</span></div>';
    return;
  }
  grid.innerHTML = store.items.map((item, i) => `
    <article class="market-card" data-index="${i}" tabindex="0" aria-label="${escapeHtml(item.name)} 상세보기">
      <div class="market-media">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">` : '<div class="image-placeholder">NO IMAGE</div>'}
        <div class="media-shade"></div>
        <span class="stock-pill">${item.quantity > 0 ? `재고 ${item.quantity}` : '품절'}</span>
        <button class="card-arrow" tabindex="-1" aria-hidden="true">↗</button>
      </div>
      <div class="market-info">
        <div class="market-title-row"><h3>${escapeHtml(item.name)}</h3><strong>${won(item.price)}</strong></div>
        <p>${escapeHtml(item.description || '상세 정보를 확인해보세요.')}</p>
      </div>
    </article>`).join('');

  document.querySelectorAll('.market-card').forEach(card => {
    card.addEventListener('click', () => openDetail(Number(card.dataset.index)));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(Number(card.dataset.index));
      }
    });
  });
}

function openDetail(index) {
  const item = store.items[index];
  if (!item) return;
  const image = document.querySelector('#detailImage');
  image.src = item.image || '';
  image.alt = item.name || '상품 이미지';
  document.querySelector('#detailSeller').textContent = `${store.seller?.name || '판매자'} · SELLER`;
  document.querySelector('#detailName').textContent = item.name;
  document.querySelector('#detailPrice').textContent = won(item.price);
  document.querySelector('#detailQty').textContent = item.quantity > 0 ? `재고 ${item.quantity}개` : '현재 품절';
  document.querySelector('#detailText').textContent = item.details || item.description || '상세 설명이 없습니다.';
  const profileBtn = document.querySelector('#profileBtn');
  profileBtn.href = store.seller?.openProfileUrl || '#';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openProfile() {
  const url = store.seller?.openProfileUrl;
  if (!url || url === '#') return showToast('오픈프로필 링크가 아직 설정되지 않았습니다.');
  window.open(url, '_blank', 'noopener');
}

async function sharePage() {
  try {
    if (navigator.share) {
      await navigator.share({ title: `${store.seller?.name || '판매자'}의 거래글`, text: '판매 중인 아이템을 확인해보세요.', url: location.href });
    } else {
      await navigator.clipboard.writeText(location.href);
      showToast('거래글 링크를 복사했습니다.');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('공유 기능을 사용할 수 없습니다.');
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelector('#closeBtn').addEventListener('click', closeDetail);
document.querySelector('[data-close-modal]').addEventListener('click', closeDetail);
document.querySelector('#shareBtn').addEventListener('click', sharePage);
document.querySelector('#openProfileHero').addEventListener('click', openProfile);
document.querySelector('#dockProfile').addEventListener('click', openProfile);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}
load();
