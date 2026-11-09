
(() => {
  const cfg = window.VENTURA_CONFIG || {};
  const ready = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    window.supabase
  );

  const client = ready
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const $ = (s) => document.querySelector(s);
  const money = (v) => Number(v || 0).toLocaleString('pt-BR', {
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
    return [...document.querySelectorAll(
      '#booking-services input[type="checkbox"]:checked'
    )].map(input => services.find(s => s.id === input.value))
      .filter(Boolean);
  }

  function updateTotal() {
    const chosen = selectedServices();
    const total = chosen.reduce((sum, s) => sum + Number(s.price), 0);
    const el = $('#booking-total');
    if (el) el.textContent = money(total);
  }

  async function loadServices() {
    const host = $('#service-list');
    const bookingHost = $('#booking-services');

    if (!ready) {
      if (host) host.innerHTML =
        '<p class="muted">Conexão ainda não configurada.</p>';
      return;
    }

    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .eq('active', true)
      .order('name');

    if (error) {
      if (host) host.innerHTML =
        '<p class="muted">Não foi possível carregar os serviços.</p>';
      console.error(error);
      return;
    }

    services = data || [];

    if (host) {
      host.innerHTML = services.length
        ? services.map(s => `
          <article class="service-card">
            <h3>${escapeHtml(s.name)}</h3>
            <div class="price">${money(s.price)}</div>
          </article>
        `).join('')
        : '<p class="muted">Nenhum serviço cadastrado.</p>';
    }

    if (bookingHost) {
      bookingHost.innerHTML = services.length
        ? services.map(s => `
          <label class="service-choice">
            <span>
              <input type="checkbox" value="${s.id}">
              ${escapeHtml(s.name)}
            </span>
            <strong>${money(s.price)}</strong>
          </label>
        `).join('')
        : '<p class="muted">Nenhum serviço disponível.</p>';
    }

    updateTotal();
  }

  $('#booking-services')?.addEventListener('change', updateTotal);

  $('#booking-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!ready) {
      feedback('#booking-feedback', 'Sistema ainda não conectado.', true);
      return;
    }

    const form = e.currentTarget;
    const f = new FormData(form);
    const chosen = selectedServices();

    if (!chosen.length) {
      feedback('#booking-feedback', 'Escolha pelo menos um serviço.', true);
      return;
    }

    const total = chosen.reduce((sum, s) => sum + Number(s.price), 0);
    const firstService = chosen[0];
    const names = chosen.map(s => s.name).join(', ');
    const phone = String(f.get('customer_phone') || '').trim();

    const payload = {
      customer_name: String(f.get('customer_name') || '').trim(),
      customer_phone: phone,
      phone: phone,
      service_id: firstService.id,
      service_name: names,
      service_ids: chosen.map(s => s.id),
      service_total: total,
      price: total,
      booking_date: f.get('booking_date'),
      booking_time: f.get('booking_time'),
      notes: String(f.get('notes') || '').trim(),
      status: 'pending'
    };

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    feedback('#booking-feedback', 'Enviando solicitação...');

    const { error } = await client.from('bookings').insert(payload);

    if (button) button.disabled = false;

    if (error) {
      console.error(error);
      feedback('#booking-feedback',
        'Não foi possível enviar. Verifique os dados e tente novamente.',
        true
      );
      return;
    }

    feedback('#booking-feedback',
      'Solicitação enviada! Aguarde a confirmação pelo WhatsApp.'
    );

    const message =
      `Olá! Gostaria de solicitar um agendamento na Ventura.%0A` +
      `Nome: ${encodeURIComponent(payload.customer_name)}%0A` +
      `Serviços: ${encodeURIComponent(names)}%0A` +
      `Total: ${encodeURIComponent(money(total))}%0A` +
      `Data: ${payload.booking_date}%0A` +
      `Horário: ${payload.booking_time}`;

    window.open(
      `https://wa.me/5566992923000?text=${message}`,
      '_blank'
    );

    form.reset();
    updateTotal();
  });

  $('#login-form')?.addEventListener('submit', async e => {
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
      feedback('#login-feedback', 'Não foi possível entrar. Verifique e-mail e senha.', true);
      return;
    }

    await showDashboard();
  });

  async function showDashboard() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data: admin, error } = await client
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !admin) {
      await client.auth.signOut();
      feedback('#login-feedback',
        'Esta conta não possui permissão administrativa.',
        true
      );
      return;
    }

    $('#login-panel')?.classList.add('hidden');
    $('#dashboard')?.classList.remove('hidden');

    await Promise.all([
      loadBookings(),
      loadAdminServices(),
      loadSales()
    ]);
  }

  function table(headers, rows) {
    return `
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`
          }
        </tbody>
      </table>
    `;
  }

  async function loadBookings() {
    const host = $('#booking-list');
    if (!host) return;

    const { data, error } = await client
      .from('bookings')
      .select('id,customer_name,customer_phone,service_name,booking_date,booking_time,status')
      .order('booking_date', { ascending: true });

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar os agendamentos.';
      return;
    }

    host.innerHTML = table(
      ['Cliente', 'Contato', 'Serviço', 'Data', 'Hora', 'Status', 'Ação'],
      (data || []).map(b => [
        escapeHtml(b.customer_name),
        escapeHtml(b.customer_phone || ''),
        escapeHtml(b.service_name || '—'),
        escapeHtml(b.booking_date || ''),
        escapeHtml(b.booking_time || ''),
        `<span class="status">${escapeHtml(b.status)}</span>`,
        `
          <button class="small-btn" data-confirm="${b.id}">Confirmar</button>
          <button class="small-btn" data-cancel="${b.id}">Cancelar</button>
          <button class="delete-btn" data-delete="${b.id}" title="Excluir">×</button>
        `
      ])
    );
  }

  $('#booking-list')?.addEventListener('click', async e => {
    const button = e.target.closest('button');
    if (!button) return;

    const id = button.dataset.confirm ||
      button.dataset.cancel ||
      button.dataset.delete;

    if (!id) return;

    if (button.dataset.delete) {
      if (!confirm('Deseja realmente excluir este agendamento?')) return;

      const { error } = await client
        .from('bookings')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Não foi possível excluir. Verifique as permissões.');
        console.error(error);
        return;
      }

      await loadBookings();
      return;
    }

    const status = button.dataset.confirm ? 'confirmed' : 'cancelled';

    const { error } = await client
      .from('bookings')
      .update({ status })
      .eq('id', id);

    if (error) {
      alert('Não foi possível atualizar o agendamento.');
      console.error(error);
      return;
    }

    await loadBookings();
  });

  async function loadAdminServices() {
    const host = $('#admin-service-list');
    if (!host) return;

    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .order('name');

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar os serviços.';
      return;
    }

    host.innerHTML = table(
      ['Serviço', 'Preço', 'Ativo'],
      (data || []).map(s => [
        escapeHtml(s.name),
        money(s.price),
        s.active ? 'Sim' : 'Não'
      ])
    );
  }

  $('#service-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    const { error } = await client.from('services').insert({
      name: String(f.get('name') || '').trim(),
      price: Number(f.get('price')),
      active: true
    });

    if (error) {
      alert('Não foi possível adicionar o serviço.');
      console.error(error);
      return;
    }

    e.currentTarget.reset();
    await loadServices();
    await loadAdminServices();
  });

  async function loadSales() {
    const host = $('#sales-list');
    if (!host) return;

    const { data, error } = await client
      .from('sales')
      .select('description,amount,sale_date')
      .order('sale_date', { ascending: false });

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar as vendas.';
      return;
    }

    host.innerHTML = table(
      ['Descrição', 'Valor', 'Data'],
      (data || []).map(s => [
        escapeHtml(s.description),
        money(s.amount),
        escapeHtml(s.sale_date)
      ])
    );
  }

  $('#sale-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    const { error } = await client.from('sales').insert({
      description: String(f.get('description') || '').trim(),
      amount: Number(f.get('amount')),
      sale_date: f.get('sale_date')
    });

    if (error) {
      alert('Não foi possível salvar a venda.');
      console.error(error);
      return;
    }

    e.currentTarget.reset();
    await loadSales();
  });

  $('#refresh-bookings')?.addEventListener('click', loadBookings);

  $('#logout')?.addEventListener('click', async () => {
    await client.auth.signOut();
    $('#dashboard')?.classList.add('hidden');
    $('#login-panel')?.classList.remove('hidden');
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
