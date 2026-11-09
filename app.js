
(() => {
  'use strict';

  // ==========================================
  // CONFIGURAÇÃO
  // ==========================================

  const config = window.VENTURA_CONFIG || {};

  const connected = Boolean(
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    window.supabase
  );

  const db = connected
    ? window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY
      )
    : null;

  const WHATSAPP_NUMBER = '5566992923000';

  const $ = selector => document.querySelector(selector);

  const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
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

  function setBusy(button, busy, original = 'Salvar') {
    if (!button) return;

    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || original;
    }

    button.disabled = busy;
    button.textContent = busy
      ? 'Aguarde...'
      : button.dataset.originalText;
  }

  function getEventElement(event) {
    const target = event.target;

    if (target instanceof Element) return target;

    return target?.parentElement || null;
  }

  // ==========================================
  // SERVIÇOS DA PÁGINA
  // ==========================================

  async function loadServices() {
    const host = $('#service-list');
    const bookingHost = $('#booking-services');

    if (!connected) {
      if (host) {
        host.innerHTML =
          '<p class="muted">Conexão com o banco não configurada.</p>';
      }

      if (bookingHost) {
        bookingHost.innerHTML =
          '<p class="muted">Serviços indisponíveis.</p>';
      }

      return;
    }

    try {
      const { data, error } = await db
        .from('services')
        .select('id,name,price,active')
        .eq('active', true)
        .order('name');

      if (error) throw error;

      services = data || [];

      if (host) {
        host.innerHTML = services.length
          ? services.map(service => `
              <article class="service-card">
                <h3>${escapeHtml(service.name)}</h3>
                <div class="price">${money(service.price)}</div>
              </article>
            `).join('')
          : '<p class="muted">Nenhum serviço disponível no momento.</p>';
      }

      if (bookingHost) {
        bookingHost.innerHTML = services.length
          ? services.map(service => `
              <div class="booking-service-option">
                <input
                  type="checkbox"
                  id="service-${escapeHtml(service.id)}"
                  name="service_ids"
                  value="${escapeHtml(service.id)}"
                  data-price="${Number(service.price)}"
                >

                <label for="service-${escapeHtml(service.id)}">
                  <span>${escapeHtml(service.name)}</span>
                  <strong>${money(service.price)}</strong>
                </label>
              </div>
            `).join('')
          : '<p class="muted">Nenhum serviço disponível.</p>';
      }

      updateBookingTotal();

    } catch (error) {
      console.error('Erro ao carregar serviços:', error);

      if (host) {
        host.innerHTML =
          '<p class="muted">Não foi possível carregar os serviços.</p>';
      }

      if (bookingHost) {
        bookingHost.innerHTML =
          '<p class="muted">Não foi possível carregar as opções.</p>';
      }
    }
  }

  function updateBookingTotal() {
    const selected = document.querySelectorAll(
      '#booking-services input[name="service_ids"]:checked'
    );

    const total = [...selected].reduce(
      (sum, input) => sum + Number(input.dataset.price || 0),
      0
    );

    const output = $('#booking-total');

    if (output) {
      output.textContent = money(total);
    }
  }

  $('#booking-services')?.addEventListener(
    'change',
    updateBookingTotal
  );

  // ==========================================
  // AGENDAMENTO E WHATSAPP
  // ==========================================

  $('#booking-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!connected) {
      feedback(
        '#booking-feedback',
        'Sistema sem conexão com o banco de dados.',
        true
      );
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const button = form.querySelector('[type="submit"]');

    const customerName = String(
      formData.get('customer_name') || ''
    ).trim();

    const phone = String(
      formData.get('customer_phone') || ''
    ).trim();

    const date = String(
      formData.get('booking_date') || ''
    );

    const time = String(
      formData.get('booking_time') || ''
    );

    const notes = String(
      formData.get('notes') || ''
    ).trim();

    const selectedIds = [
      ...document.querySelectorAll(
        '#booking-services input[name="service_ids"]:checked'
      )
    ].map(input => input.value);

    const chosenServices = services.filter(service =>
      selectedIds.includes(String(service.id))
    );

    if (
      !customerName ||
      !phone ||
      !date ||
      !time ||
      !chosenServices.length
    ) {
      feedback(
        '#booking-feedback',
        'Preencha os dados e selecione pelo menos um serviço.',
        true
      );
      return;
    }

    const total = chosenServices.reduce(
      (sum, service) => sum + Number(service.price || 0),
      0
    );

    const firstService = chosenServices[0];

    const serviceNames = chosenServices
      .map(service => service.name)
      .join(', ');

    const payload = {
      customer_name: customerName,
      customer_phone: phone,
      phone: phone,
      service_id: firstService.id,
      service_name: serviceNames,
      service_ids: chosenServices.map(service => service.id),
      service_total: total,
      price: total,
      booking_date: date,
      booking_time: time,
      notes: notes,
      status: 'pending'
    };

    setBusy(button, true);

    feedback(
      '#booking-feedback',
      'Salvando sua solicitação...'
    );

    try {
      const { error } = await db
        .from('bookings')
        .insert(payload);

      if (error) throw error;

      const message = [
        'Olá! Gostaria de solicitar um agendamento na Ventura Beauty Studio.',
        '',
        `Nome: ${customerName}`,
        `WhatsApp: ${phone}`,
        `Serviços: ${serviceNames}`,
        `Total: ${money(total)}`,
        `Data desejada: ${date}`,
        `Horário desejado: ${time}`,
        `Observações: ${notes || 'Nenhuma'}`,
        '',
        'Aguardo a confirmação do horário.'
      ].join('\n');

      const whatsappUrl =
        'https://wa.me/' +
        WHATSAPP_NUMBER +
        '?text=' +
        encodeURIComponent(message);

      feedback(
        '#booking-feedback',
        'Agendamento salvo! Abrindo o WhatsApp...'
      );

      form.reset();
      updateBookingTotal();

      // Abre o WhatsApp somente depois de salvar no banco.
      window.location.assign(whatsappUrl);

    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);

      feedback(
        '#booking-feedback',
        'Não foi possível enviar. Verifique os dados e tente novamente.',
        true
      );

    } finally {
      setBusy(button, false);
    }
  });

  // ==========================================
  // LOGIN ADMINISTRATIVO
  // ==========================================

  $('#login-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!connected) {
      feedback(
        '#login-feedback',
        'Conexão com o banco não configurada.',
        true
      );
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const button = form.querySelector('[type="submit"]');

    setBusy(button, true);

    try {
      const { error } = await db.auth.signInWithPassword({
        email: formData.get('email'),
        password: formData.get('password')
      });

      if (error) throw error;

      await showDashboard();

    } catch (error) {
      console.error('Erro no login:', error);

      feedback(
        '#login-feedback',
        'E-mail ou senha não conferem.',
        true
      );

    } finally {
      setBusy(button, false);
    }
  });

  async function showDashboard() {
    if (!connected) return;

    try {
      const {
        data: { user },
        error: userError
      } = await db.auth.getUser();

      if (userError) throw userError;

      if (!user) return;

      const { data: admin, error } = await db
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!admin) {
        await db.auth.signOut();

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

    } catch (error) {
      console.error('Erro ao abrir painel:', error);

      feedback(
        '#login-feedback',
        'Não foi possível abrir o painel administrativo.',
        true
      );
    }
  }

  // ==========================================
  // TABELAS
  // ==========================================

  function makeTable(headers, rows) {
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
              : `
                  <tr>
                    <td colspan="${headers.length}">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                `
          }
        </tbody>
      </table>
    `;
  }

  // ==========================================
  // AGENDAMENTOS ADMINISTRATIVOS
  // ==========================================

  async function loadBookings() {
    const host = $('#booking-list');

    if (!host || !connected) return;

    try {
      const { data, error } = await db
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

      if (error) throw error;

      host.innerHTML = makeTable(
        [
          'Cliente',
          'Contato',
          'Serviços',
          'Data',
          'Hora',
          'Status',
          'Ações'
        ],

        (data || []).map(booking => [
          escapeHtml(booking.customer_name),
          escapeHtml(booking.customer_phone || ''),
          escapeHtml(booking.service_name || '—'),
          escapeHtml(booking.booking_date || ''),
          escapeHtml(booking.booking_time || ''),
          escapeHtml(booking.status || ''),
          `
            <button
              type="button"
              class="small-btn"
              data-confirm="${escapeHtml(booking.id)}"
            >Confirmar</button>

            <button
              type="button"
              class="small-btn"
              data-cancel="${escapeHtml(booking.id)}"
            >Cancelar</button>
          `
        ])
      );

    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      host.textContent =
        'Não foi possível carregar os agendamentos.';
    }
  }

  $('#booking-list')?.addEventListener('click', async event => {
    const target = getEventElement(event);

    const button = target?.closest(
      '[data-confirm], [data-cancel]'
    );

    if (!button || !connected) return;

    const id = button.dataset.confirm || button.dataset.cancel;

    const status = button.dataset.confirm
      ? 'confirmed'
      : 'cancelled';

    button.disabled = true;

    try {
      const { error } = await db
        .from('bookings')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      await loadBookings();

    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      alert('Não foi possível atualizar o agendamento.');
      button.disabled = false;
    }
  });

  $('#refresh-bookings')?.addEventListener(
    'click',
    loadBookings
  );

  // ==========================================
  // GERENCIAMENTO DE SERVIÇOS
  // ==========================================

  async function loadAdminServices() {
    const host = $('#admin-service-list');

    if (!host || !connected) return;

    try {
      const { data, error } = await db
        .from('services')
        .select('id,name,price,active')
        .order('name');

      if (error) throw error;

      host.innerHTML = makeTable(
        ['Serviço', 'Preço', 'Situação', 'Ações'],

        (data || []).map(service => [
          escapeHtml(service.name),
          money(service.price),
          service.active ? 'Ativo' : 'Inativo',
          `
            <button
              type="button"
              class="small-btn"
              data-edit-service="${escapeHtml(service.id)}"
            >Editar</button>

            <button
              type="button"
              class="small-btn"
              data-toggle-service="${escapeHtml(service.id)}"
              data-active="${service.active}"
            >
              ${service.active ? 'Retirar' : 'Reativar'}
            </button>
          `
        ])
      );

    } catch (error) {
      console.error('Erro ao carregar serviços administrativos:', error);
      host.textContent =
        'Não foi possível carregar os serviços.';
    }
  }

  // ADICIONAR SERVIÇO

  $('#service-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!connected) {
      feedback(
        '#service-feedback',
        'Conexão com o banco não configurada.',
        true
      );
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const name = String(
      formData.get('name') || ''
    ).trim();

    const price = Number(formData.get('price'));

    if (
      !name ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      feedback(
        '#service-feedback',
        'Informe um nome e um preço válido.',
        true
      );
      return;
    }

    const button = form.querySelector('[type="submit"]');

    setBusy(button, true);

    try {
      const { error } = await db
        .from('services')
        .insert({
          name,
          price,
          active: true
        });

      if (error) throw error;

      form.reset();

      feedback(
        '#service-feedback',
        'Serviço adicionado com sucesso!'
      );

      await loadServices();
      await loadAdminServices();

    } catch (error) {
      console.error('Erro ao adicionar serviço:', error);

      feedback(
        '#service-feedback',
        'Não foi possível adicionar o serviço.',
        true
      );

    } finally {
      setBusy(button, false);
    }
  });

  // EDITAR, RETIRAR E REATIVAR SERVIÇOS

  $('#admin-service-list')?.addEventListener('click', async event => {
    const target = getEventElement(event);

    const editButton = target?.closest('[data-edit-service]');
    const toggleButton = target?.closest('[data-toggle-service]');

    if (!connected) return;

    if (editButton) {
      const service = await getService(
        editButton.dataset.editService
      );

      if (!service) return;

      const newName = prompt(
        'Nome do serviço:',
        service.name
      );

      if (newName === null) return;

      const newPrice = prompt(
        'Preço do serviço:',
        service.price
      );

      if (newPrice === null) return;

      const name = newName.trim();
      const price = Number(
        newPrice.replace(',', '.')
      );

      if (
        !name ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        alert('Nome ou preço inválido.');
        return;
      }

      try {
        const { error } = await db
          .from('services')
          .update({ name, price })
          .eq('id', service.id);

        if (error) throw error;

        await loadServices();
        await loadAdminServices();

      } catch (error) {
        console.error('Erro ao editar serviço:', error);
        alert('Não foi possível editar o serviço.');
      }
    }

    if (toggleButton) {
      const id = toggleButton.dataset.toggleService;

      const currentlyActive =
        toggleButton.dataset.active === 'true';

      const nextActive = !currentlyActive;

      const message = nextActive
        ? 'Deseja reativar este serviço?'
        : 'Deseja retirar este serviço da página de agendamento?';

      if (!confirm(message)) return;

      try {
        const { error } = await db
          .from('services')
          .update({ active: nextActive })
          .eq('id', id);

        if (error) throw error;

        await loadServices();
        await loadAdminServices();

      } catch (error) {
        console.error('Erro ao alterar serviço:', error);
        alert('Não foi possível alterar o serviço.');
      }
    }
  });

  async function getService(id) {
    try {
      const { data, error } = await db
        .from('services')
        .select('id,name,price,active')
        .eq('id', id)
        .single();

      if (error) throw error;

      return data;

    } catch (error) {
      console.error('Erro ao localizar serviço:', error);
      alert('Não foi possível localizar o serviço.');
      return null;
    }
  }

  // ==========================================
  // VENDAS
  // ==========================================

  async function loadSales() {
    const host = $('#sales-list');

    if (!host || !connected) return;

    try {
      const { data, error } = await db
        .from('sales')
        .select('description,amount,sale_date')
        .order('sale_date', { ascending: false });

      if (error) throw error;

      host.innerHTML = makeTable(
        ['Descrição', 'Valor', 'Data'],

        (data || []).map(sale => [
          escapeHtml(sale.description),
          money(sale.amount),
          escapeHtml(sale.sale_date || '')
        ])
      );

    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
      host.textContent =
        'Não foi possível carregar as vendas.';
    }
  }

  $('#sale-form')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!connected) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    const description = String(
      formData.get('description') || ''
    ).trim();

    const amount = Number(
      formData.get('amount')
    );

    const saleDate = formData.get('sale_date');

    if (
      !description ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !saleDate
    ) {
      alert('Preencha todos os dados da venda corretamente.');
      return;
    }

    const button = form.querySelector('[type="submit"]');

    setBusy(button, true);

    try {
      const { error } = await db
        .from('sales')
        .insert({
          description,
          amount,
          sale_date: saleDate
        });

      if (error) throw error;

      form.reset();

      await loadSales();

    } catch (error) {
      console.error('Erro ao salvar venda:', error);
      alert('Não foi possível salvar a venda.');

    } finally {
      setBusy(button, false);
    }
  });

  // ==========================================
  // ABAS DO PAINEL
  // ==========================================

  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle(
          'active',
          tab === button
        );
      });

      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle(
          'hidden',
          panel.id !== button.dataset.tab
        );
      });
    });
  });

  // ==========================================
  // SAIR DA ADMINISTRAÇÃO
  // ==========================================

  $('#logout')?.addEventListener('click', async () => {
    if (connected) {
      const { error } = await db.auth.signOut();

      if (error) {
        console.error('Erro ao sair:', error);
      }
    }

    $('#dashboard')?.classList.add('hidden');
    $('#login-panel')?.classList.remove('hidden');
  });

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  async function init() {
    await loadServices();

    if (!connected) return;

    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      if (data.session) {
        await showDashboard();
      }

    } catch (error) {
      console.error('Erro na inicialização:', error);
    }
  }

  init();

})();
