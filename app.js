
(() => {
  const cfg = window.VENTURA_CONFIG || {};
  const ready = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    window.supabase
  );

  const client = ready
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

  const $ = (s) => document.querySelector(s);
  const money = (v) =>
    Number(v || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const feedback = (id, msg, error = false) => {
    const el = $(id);
    if (el) {
      el.textContent = msg;
      el.style.color = error ? '#df7777' : '#ead19a';
    }
  };

  let services = [];

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function selectedServices() {
    const ids = [...document.querySelectorAll(
      '#booking-services input:checked'
    )].map(input => input.value);

    return services.filter(s => ids.includes(s.id));
  }

  function updateBookingTotal() {
    const chosen = selectedServices();
    const total = chosen.reduce(
      (sum, s) => sum + Number(s.price || 0), 0
    );

    $('#booking-total').textContent = money(total);
  }

  async function loadServices() {
    const host = $('#service-list');
    const bookingHost = $('#booking-services');

    if (!ready) {
      host.innerHTML =
        '<p class="muted">Conexão ainda não configurada.</p>';
      return;
    }

    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .eq('active', true)
      .order('name');

    if (error) {
      host.innerHTML =
        '<p class="muted">Não foi possível carregar os serviços.</p>';
      bookingHost.textContent = 'Erro ao carregar serviços.';
      return;
    }

    services = data || [];

    host.innerHTML = services.length
      ? services.map(s => `
          <article class="service-card">
            <h3>${escapeHtml(s.name)}</h3>
            <div class="price">${money(s.price)}</div>
          </article>
        `).join('')
      : '<p class="muted">Nenhum serviço cadastrado.</p>';

    bookingHost.innerHTML = services.length
      ? services.map(s => `
          <label style="display:flex;align-items:center;gap:10px;margin:10px 0">
            <input
              type="checkbox"
              value="${escapeHtml(s.id)}"
              style="width:auto"
            >
            <span>${escapeHtml(s.name)} — ${money(s.price)}</span>
          </label>
        `).join('')
      : '<p>Nenhum serviço disponível.</p>';

    updateBookingTotal();
  }

  $('#booking-services').addEventListener(
    'change',
    updateBookingTotal
  );

  $('#booking-form').addEventListener('submit', async e => {
    e.preventDefault();

    if (!ready) {
      feedback(
        '#booking-feedback',
        'Sistema ainda não conectado ao banco.',
        true
      );
      return;
    }

    const form = e.currentTarget;
    const f = new FormData(form);
    const chosen = selectedServices();

    if (!chosen.length) {
      feedback(
        '#booking-feedback',
        'Selecione pelo menos um serviço.',
        true
      );
      return;
    }

    const total = chosen.reduce(
      (sum, s) => sum + Number(s.price || 0), 0
    );

    const names = chosen.map(s => s.name).join(', ');
    const firstService = chosen[0];

    const phone = String(
      f.get('customer_phone') || ''
    ).trim();

    const payload = {
      customer_name: String(f.get('customer_name') || '').trim(),
      customer_phone: phone,
      phone: phone,
      service_id: firstService.id,
      service_name: names,
      service_ids: chosen.map(s => s.id),
      service_total: total,
      booking_date: f.get('booking_date'),
      booking_time: f.get('booking_time'),
      notes: String(f.get('notes') || '').trim(),
      status: 'pending'
    };

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Enviando...';

    const { error } = await client
      .from('bookings')
      .insert(payload);

    button.disabled = false;
    button.textContent = 'Enviar solicitação';

    if (error) {
      feedback(
        '#booking-feedback',
        'Erro do Supabase: ' + error.message,
        true
      );
      return;
    }

    form.reset();
    updateBookingTotal();

    feedback(
      '#booking-feedback',
      'Solicitação enviada! Aguarde a confirmação pelo WhatsApp.'
    );
  });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();

    if (!ready) {
      feedback('#login-feedback', 'Configure a conexão primeiro.', true);
      return;
    }

    const f = new FormData(e.currentTarget);

    const { error } = await client.auth.signInWithPassword({
      email: f.get('email'),
      password: f.get('password')
    });

    if (error) {
      feedback(
        '#login-feedback',
        'Não foi possível entrar. Verifique e-mail e senha.',
        true
      );
      return;
    }

    await showDashboard();
  });

  async function showDashboard() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data: admin } = await client
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin) {
      await client.auth.signOut();
      feedback(
        '#login-feedback',
        'Esta conta não possui permissão administrativa.',
        true
      );
      return;
    }

    $('#login-panel').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');

    await Promise.all([
      loadBookings(),
      loadAdminServices(),
      loadSales()
    ]);
  }

  async function loadBookings() {
    const host = $('#booking-list');

    const { data, error } = await client
      .from('bookings')
      .select(
        'id,customer_name,customer_phone,service_name,service_total,booking_date,booking_time,status,notes'
      )
      .order('booking_date', { ascending: true });

    if (error) {
      host.textContent =
        'Erro ao carregar agendamentos: ' + error.message;
      return;
    }

    host.innerHTML = table(
      ['Cliente', 'Contato', 'Serviços', 'Total', 'Data', 'Hora', 'Status', 'Ação'],
      (data || []).map(b => [
        escapeHtml(b.customer_name),
        escapeHtml(b.customer_phone || ''),
        escapeHtml(b.service_name || '—'),
        money(b.service_total),
        b.booking_date,
        b.booking_time,
        `<span class="status">${escapeHtml(b.status)}</span>`,
        `<button class="small-btn" data-confirm="${b.id}">Confirmar</button>
         <button class="small-btn" data-cancel="${b.id}">Cancelar</button>`
      ])
    );
  }

  function table(headers, rows) {
    return `
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map(r =>
                `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`
              ).join('')
            : `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`
          }
        </tbody>
      </table>
    `;
  }

  $('#booking-list').addEventListener('click', async e => {
    const id = e.target.dataset.confirm || e.target.dataset.cancel;
    if (!id) return;

    const status = e.target.dataset.confirm
      ? 'confirmed'
      : 'cancelled';

    const { error } = await client
      .from('bookings')
      .update({ status })
      .eq('id', id);

    if (error) {
      alert('Erro ao atualizar: ' + error.message);
      return;
    }

    await loadBookings();
  });

  async function loadAdminServices() {
    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .order('name');

    if (error) return;

    $('#admin-service-list').innerHTML = table(
      ['Serviço', 'Preço', 'Ativo'],
      (data || []).map(s => [
        escapeHtml(s.name),
        money(s.price),
        s.active ? 'Sim' : 'Não'
      ])
    );
  }

  $('#service-form').addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    const { error } = await client.from('services').insert({
      name: f.get('name').trim(),
      price: Number(f.get('price')),
      active: true
    });

    if (error) {
      alert('Erro ao adicionar serviço: ' + error.message);
      return;
    }

    e.currentTarget.reset();
    await loadServices();
    await loadAdminServices();
  });

  async function loadSales() {
    const { data, error } = await client
      .from('sales')
      .select('description,amount,sale_date')
      .order('sale_date', { ascending: false });

    if (error) {
      $('#sales-list').textContent =
        'Não foi possível carregar as vendas.';
      return;
    }

    $('#sales-list').innerHTML = table(
      ['Descrição', 'Valor', 'Data'],
      (data || []).map(s => [
        escapeHtml(s.description),
        money(s.amount),
        s.sale_date
      ])
    );
  }

  $('#sale-form').addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    const { error } = await client.from('sales').insert({
      description: f.get('description').trim(),
      amount: Number(f.get('amount')),
      sale_date: f.get('sale_date')
    });

    if (error) {
      alert('Erro ao salvar venda: ' + error.message);
      return;
    }

    e.currentTarget.reset();
    await loadSales();
  });

  $('#refresh-bookings').addEventListener('click', loadBookings);

  $('#logout').addEventListener('click', async () => {
    await client.auth.signOut();
    $('#dashboard').classList.add('hidden');
    $('#login-panel').classList.remove('hidden');
  });

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x =>
        x.classList.toggle('active', x === btn)
      );

      document.querySelectorAll('.tab-panel').forEach(x =>
        x.classList.toggle('hidden', x.id !== btn.dataset.tab)
      );
    });
  });

  if (ready) {
    loadServices();
    client.auth.getSession().then(({ data }) => {
      if (data.session) showDashboard();
    });
  } else {
    loadServices();
  }
})();
