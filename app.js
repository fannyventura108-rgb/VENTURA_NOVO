(() => {
  'use strict';

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

  const $ = selector => document.querySelector(selector);

  const money = value =>
    Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const feedback = (selector, message, error = false) => {
    const element = $(selector);
    if (!element) return;

    element.textContent = message;
    element.style.color = error ? '#df7777' : '#ead19a';
  };

  let services = [];

  // CARREGAR SERVIÇOS
  async function loadServices() {
    const host = $('#service-list');
    const select = $('#booking-service');

    if (!ready) {
      if (host) {
        host.innerHTML =
          '<p class="muted">Conexão ainda não configurada.</p>';
      }
      return;
    }

    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error(error);

      if (host) {
        host.innerHTML =
          '<p class="muted">Não foi possível carregar os serviços.</p>';
      }
      return;
    }

    services = data || [];

    if (host) {
      host.innerHTML = services.length
        ? services.map(service => `
            <article class="service-card">
              <h3>${escapeHtml(service.name)}</h3>
              <div class="price">${money(service.price)}</div>
            </article>
          `).join('')
        : '<p class="muted">Nenhum serviço cadastrado.</p>';
    }

    if (select) {
      select.innerHTML =
        '<option value="">Selecione um serviço</option>' +
        services.map(service => `
          <option value="${escapeHtml(service.id)}">
            ${escapeHtml(service.name)} — ${money(service.price)}
          </option>
        `).join('');
    }
  }

  // AGENDAMENTO
  const bookingForm = $('#booking-form');

  if (bookingForm) {
    bookingForm.addEventListener('submit', async event => {
      event.preventDefault();

      if (!ready) {
        feedback(
          '#booking-feedback',
          'Sistema ainda não conectado ao banco de dados.',
          true
        );
        return;
      }

      const form = event.currentTarget;
      const data = new FormData(form);

      const customerName = String(
        data.get('customer_name') || ''
      ).trim();

      const phone = String(
        data.get('customer_phone') || ''
      ).trim();

      const serviceId = String(
        data.get('service_id') || ''
      );

      const selectedService = services.find(
        service => service.id === serviceId
      );

      if (!selectedService) {
        feedback(
          '#booking-feedback',
          'Selecione um serviço disponível.',
          true
        );
        return;
      }

      const total = Number(selectedService.price || 0);

      // Campos compatíveis com o banco atual
      const payload = {
        customer_name: customerName,
        customer_phone: phone,
        phone: phone,
        service_id: selectedService.id,
        service_name: selectedService.name,
        service_ids: [selectedService.id],
        service_total: total,
        price: total,
        booking_date: data.get('booking_date'),
        booking_time: data.get('booking_time'),
        notes: String(data.get('notes') || '').trim(),
        status: 'pending'
      };

      const button = form.querySelector(
        'button[type="submit"]'
      );

      if (button) {
        button.disabled = true;
        button.textContent = 'Enviando...';
      }

      const { error } = await client
        .from('bookings')
        .insert(payload);

      if (error) {
        console.error('Erro no agendamento:', error);

        feedback(
          '#booking-feedback',
          'Não foi possível enviar. Tente novamente.',
          true
        );

        if (button) {
          button.disabled = false;
          button.textContent = 'Enviar solicitação';
        }

        return;
      }

      feedback(
        '#booking-feedback',
        'Solicitação enviada! Aguarde a confirmação pelo WhatsApp.'
      );

      const message = [
        'Olá! Gostaria de solicitar um agendamento na Ventura.',
        '',
        `Nome: ${customerName}`,
        `WhatsApp: ${phone}`,
        `Serviço: ${selectedService.name}`,
        `Valor: ${money(total)}`,
        `Data desejada: ${payload.booking_date}`,
        `Horário desejado: ${payload.booking_time}`,
        `Observações: ${payload.notes || 'Nenhuma'}`
      ].join('\n');

      form.reset();

      if (button) {
        button.disabled = false;
        button.textContent = 'Enviar solicitação';
      }

      window.location.href =
        'https://wa.me/5566992923000?text=' +
        encodeURIComponent(message);
    });
  }

  // LOGIN
  const loginForm = $('#login-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();

      if (!ready) {
        feedback(
          '#login-feedback',
          'Configure a conexão primeiro.',
          true
        );
        return;
      }

      const data = new FormData(event.currentTarget);

      const { error } = await client.auth.signInWithPassword({
        email: data.get('email'),
        password: data.get('password')
      });

      if (error) {
        console.error(error);

        feedback(
          '#login-feedback',
          'Não foi possível entrar. Verifique e-mail e senha.',
          true
        );
        return;
      }

      await showDashboard();
    });
  }

  // VERIFICAR ADMINISTRADOR
  async function showDashboard() {
    if (!ready) return;

    const {
      data: { user }
    } = await client.auth.getUser();

    if (!user) return;

    const { data: admin, error } = await client
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !admin) {
      await client.auth.signOut();

      feedback(
        '#login-feedback',
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

  // TABELAS
  function createTable(headers, rows) {
    return `
      <table>
        <thead>
          <tr>
            ${headers.map(header => `<th>${header}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    ${row.map(cell => `<td>${cell}</td>`).join('')}
                  </tr>
                `).join('')
              : `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`
          }
        </tbody>
      </table>
    `;
  }

  // AGENDAMENTOS ADMINISTRATIVOS
  async function loadBookings() {
    const host = $('#booking-list');

    if (!host || !ready) return;

    const { data, error } = await client
      .from('bookings')
      .select(`
        id,
        customer_name,
        customer_phone,
        service_name,
        booking_date,
        booking_time,
        status,
        notes
      `)
      .order('booking_date', { ascending: true });

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar os agendamentos.';
      return;
    }

    host.innerHTML = createTable(
      [
        'Cliente',
        'Contato',
        'Serviço',
        'Data',
        'Hora',
        'Status',
        'Ação'
      ],
      (data || []).map(booking => [
        escapeHtml(booking.customer_name),
        escapeHtml(booking.customer_phone || ''),
        escapeHtml(booking.service_name || '—'),
        escapeHtml(booking.booking_date || ''),
        escapeHtml(booking.booking_time || ''),
        `<span class="status">${escapeHtml(booking.status)}</span>`,
        `
          <button class="small-btn" data-confirm="${escapeHtml(booking.id)}">
            Confirmar
          </button>
          <button class="small-btn" data-cancel="${escapeHtml(booking.id)}">
            Cancelar
          </button>
        `
      ])
    );
  }

  // CONFIRMAR E CANCELAR
  $('#booking-list')?.addEventListener('click', async event => {
    const button = event.target.closest(
      '[data-confirm], [data-cancel]'
    );

    if (!button || !ready) return;

    const id =
      button.dataset.confirm || button.dataset.cancel;

    const status = button.dataset.confirm
      ? 'confirmed'
      : 'cancelled';

    const { error } = await client
      .from('bookings')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error(error);
      alert('Não foi possível atualizar o agendamento.');
      return;
    }

    await loadBookings();
  });

  // SERVIÇOS ADMINISTRATIVOS
  async function loadAdminServices() {
    const host = $('#admin-service-list');

    if (!host || !ready) return;

    const { data, error } = await client
      .from('services')
      .select('id,name,price,active')
      .order('name');

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar os serviços.';
      return;
    }

    host.innerHTML = createTable(
      ['Serviço', 'Preço', 'Ativo'],
      (data || []).map(service => [
        escapeHtml(service.name),
        money(service.price),
        service.active ? 'Sim' : 'Não'
      ])
    );
  }

  // ADICIONAR SERVIÇO
  $('#service-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!ready) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const { error } = await client
      .from('services')
      .insert({
        name: String(data.get('name') || '').trim(),
        price: Number(data.get('price')),
        active: true
      });

    if (error) {
      console.error(error);
      alert('Não foi possível adicionar o serviço.');
      return;
    }

    form.reset();

    await loadServices();
    await loadAdminServices();
  });

  // VENDAS
  async function loadSales() {
    const host = $('#sales-list');

    if (!host || !ready) return;

    const { data, error } = await client
      .from('sales')
      .select('description,amount,sale_date')
      .order('sale_date', { ascending: false });

    if (error) {
      console.error(error);
      host.textContent = 'Não foi possível carregar as vendas.';
      return;
    }

    host.innerHTML = createTable(
      ['Descrição', 'Valor', 'Data'],
      (data || []).map(sale => [
        escapeHtml(sale.description),
        money(sale.amount),
        escapeHtml(sale.sale_date || '')
      ])
    );
  }

  // SALVAR VENDA
  $('#sale-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!ready) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const { error } = await client
      .from('sales')
      .insert({
        description: String(data.get('description') || '').trim(),
        amount: Number(data.get('amount')),
        sale_date: data.get('sale_date')
      });

    if (error) {
      console.error(error);
      alert('Não foi possível salvar a venda.');
      return;
    }

    form.reset();
    await loadSales();
  });

  // ATUALIZAR AGENDAMENTOS
  $('#refresh-bookings')?.addEventListener(
    'click',
    loadBookings
  );

  // SAIR
  $('#logout')?.addEventListener('click', async () => {
    if (ready) {
      await client.auth.signOut();
    }

    $('#dashboard')?.classList.add('hidden');
    $('#login-panel')?.classList.remove('hidden');
  });

  // ABAS
  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab === button);
      });

      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle(
          'hidden',
          panel.id !== button.dataset.tab
        );
      });
    });
  });

  // INICIALIZAÇÃO
  if (ready) {
    loadServices();

    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }

      if (data.session) {
        showDashboard();
      }
    });
  } else {
    loadServices();
  }

})();
