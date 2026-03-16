
(() => {
  const forms = document.querySelectorAll('[data-b2b-form]');

  forms.forEach((form) => {
    const startedAtField = form.querySelector('input[name="started_at"]');
    if (startedAtField && !startedAtField.value) {
      startedAtField.value = new Date().toISOString();
    }
  });

  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const supabaseUrl = window.FVS_SUPABASE_URL || '';
      const supabaseAnonKey = window.FVS_SUPABASE_ANON_KEY || '';
      const functionName = window.FVS_SUPABASE_FUNCTION || 'b2b-lead-submit';
      const endpoint = buildFunctionEndpoint(supabaseUrl, functionName);
      const card = form.closest('.farm-request-card, .card, .card-soft') || form.parentElement;
      const wrapper = card?.querySelector('.form-wrapper');
      const success = card?.querySelector('.form-success');
      const submitButton = form.querySelector('button[type="submit"]');
      const originalButtonText = submitButton ? submitButton.textContent : '';
      const locale = document.documentElement.lang || 'pt-BR';
      const isEnglish = locale.toLowerCase().startsWith('en');
      const feedback = getOrCreateFeedback(form);
      const minimumSeconds = Number(window.FVS_B2B_MIN_SECONDS || 3);

      if (!supabaseUrl || !supabaseAnonKey) {
        setFeedback(
          feedback,
          isEnglish
            ? 'Configure Supabase in assets/js/form-config.js before publishing.'
            : 'Configure o Supabase em assets/js/form-config.js antes de publicar.',
          true
        );
        return;
      }

      try {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        const honeypotValue = String(payload.website || '').trim();
        const startedAt = payload.started_at ? new Date(String(payload.started_at)) : null;
        const elapsedSeconds = startedAt && !Number.isNaN(startedAt.getTime())
          ? (Date.now() - startedAt.getTime()) / 1000
          : minimumSeconds;

        if (honeypotValue) {
          form.reset();
          resetFormTimestamp(form);
          setFeedback(feedback, '', false);
          if (wrapper) wrapper.style.display = 'none';
          if (success) success.style.display = 'block';
          return;
        }

        if (elapsedSeconds < minimumSeconds) {
          setFeedback(
            feedback,
            isEnglish
              ? 'Please wait a few seconds and try again.'
              : 'Aguarde alguns segundos e tente novamente.',
            true
          );
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = isEnglish ? 'Sending...' : 'Enviando...';
        }
        setFeedback(feedback, isEnglish ? 'Sending request...' : 'Enviando solicitação...', false);

        payload.page_title = document.title;
        payload.page_url = window.location.href;
        payload.language = locale;
        payload.form_source = form.dataset.formSource || 'website-b2b-form';
        payload.submitted_at = new Date().toISOString();
        payload.user_agent = window.navigator.userAgent;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(payload),
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        form.reset();
        resetFormTimestamp(form);
        setFeedback(feedback, '', false);
        if (wrapper) wrapper.style.display = 'none';
        if (success) success.style.display = 'block';
      } catch (error) {
        setFeedback(
          feedback,
          isEnglish
            ? 'We could not send your request right now. Please try again in a moment.'
            : 'Nao foi possivel enviar sua solicitacao agora. Tente novamente em instantes.',
          true
        );
        console.error('B2B form submission failed:', error);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalButtonText;
        }
      }
    });
  });

  const cultivarCards = document.querySelectorAll('[data-cultivar-card]');
  if (cultivarCards.length) {
    cultivarCards.forEach((card) => {
      const toggle = card.querySelector('.coffee-cultivar-card__toggle');
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const isOpen = card.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  function getOrCreateFeedback(form) {
    let feedback = form.querySelector('.form-feedback');
    if (feedback) return feedback;

    feedback = document.createElement('div');
    feedback.className = 'form-feedback';
    feedback.setAttribute('aria-live', 'polite');
    form.appendChild(feedback);
    return feedback;
  }

  function setFeedback(el, message, isError) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.style.display = message ? 'block' : 'none';
  }

  function resetFormTimestamp(form) {
    const startedAtField = form.querySelector('input[name="started_at"]');
    if (startedAtField) {
      startedAtField.value = new Date().toISOString();
    }
  }

  function buildFunctionEndpoint(url, functionName) {
    const normalizedUrl = String(url || '').replace(/\/$/, '');
    if (!normalizedUrl) return '';

    if (normalizedUrl.includes('/functions/v1/')) {
      return normalizedUrl;
    }

    return `${normalizedUrl}/functions/v1/${functionName}`;
  }
})();
