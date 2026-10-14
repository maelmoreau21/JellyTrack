(function () {
  'use strict';
  window.AccountsUI = {
    async render(main, { API, State, Utils, Router }) {
      const signal = State.pageController.signal;
      main.replaceChildren();
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      const run = async (button, action) => {
        button.disabled = true; status.textContent = '';
        try { await action(); } catch (error) { if (!signal.aborted) status.textContent = error.message; }
        finally { if (!signal.aborted) button.disabled = false; }
      };
      const renderServerAdministration = async card => {
        if (State.user.role !== 'server_admin') return;
        const server = document.createElement('section'); const heading = document.createElement('h2'); heading.textContent = 'Administration de mon serveur';
        const details = document.createElement('p'); const sync = document.createElement('button'); sync.className = 'btn btn-secondary'; sync.textContent = 'Synchroniser mon serveur';
        server.append(heading, details, sync); card.append(server);
        sync.addEventListener('click', () => run(sync, async () => { await API.postJSON('/api/me/server/sync', {}); status.textContent = 'Synchronisation terminée.'; }));
        try { const data = await API.getJSON('/api/me/server'); if (!signal.aborted) details.textContent = (data.servers || []).map(s => s.name + ' : ' + s.users + ' utilisateurs, ' + s.media + ' médias, ' + s.plays + ' lectures').join('; '); }
        catch (error) { if (!signal.aborted) details.textContent = error.message; }
      };
      if (!State.navigation?.multiServer) {
        const card = document.createElement('section'); card.className = 'card';
        const title = document.createElement('h1'); title.textContent = 'Mes comptes Jellyfin';
        const help = document.createElement('p'); help.textContent = 'L’association de comptes est disponible uniquement lorsque plusieurs serveurs Jellyfin sont configurés.';
        card.append(title, help, status); main.append(card);
        await renderServerAdministration(card);
        return;
      }
      const card = document.createElement('section'); card.className = 'card';
      const title = document.createElement('h1'); title.textContent = 'Mes comptes Jellyfin';
      const help = document.createElement('p');
      help.textContent = 'Combinez vos statistiques personnelles. Les droits de chaque compte restent séparés.';
      const guide = document.createElement('details'); guide.style.margin = '1rem 0';
      const summary = document.createElement('summary'); summary.textContent = 'Comment associer un autre compte ?';
      const steps = document.createElement('ol'); steps.style.paddingLeft = '1.5rem';
      for (const text of ['Connectez-vous au second compte dans une fenêtre privée, puis ouvrez Mes comptes et générez un code.', 'Revenez dans cette fenêtre et saisissez ce code. Les deux connexions doivent dater de moins de dix minutes.']) { const step = document.createElement('li'); step.textContent = text; steps.append(step); }
      guide.append(summary, steps);
      const list = document.createElement('div'); list.style.margin = '1rem 0';
      const code = document.createElement('output'); code.style.overflowWrap = 'anywhere'; code.style.display = 'block'; code.style.margin = '1rem 0'; code.hidden = true;
      const proof = document.createElement('button'); proof.className = 'btn btn-secondary'; proof.textContent = 'Générer un code pour ce compte';
      const form = document.createElement('form'); form.style.display = 'grid'; form.style.gap = '0.75rem'; form.style.margin = '1rem 0';
      const label = document.createElement('label'); label.textContent = 'Code du compte à associer ';
      const input = document.createElement('input'); input.className = 'form-input'; input.required = true; input.autocomplete = 'off'; input.maxLength = 43;
      label.append(input);
      const submit = document.createElement('button'); submit.className = 'btn btn-primary'; submit.textContent = 'Associer mon compte';
      form.append(label, submit);
      const wrapped = document.createElement('a'); wrapped.className = 'btn btn-secondary'; wrapped.href = '/wrapped/me?combined=1'; wrapped.setAttribute('data-link', ''); wrapped.textContent = 'Mon Wrapped multi-serveur privé';
      card.append(title, help, guide, list, proof, code, form, wrapped, status); main.append(card);
      let expiryTimer;
      State.pageCleanups.push(() => clearTimeout(expiryTimer));
      const load = async () => {
        const data = await API.getJSON('/api/me/accounts'); if (signal.aborted) return;
        list.replaceChildren();
        for (const account of data.accounts || []) {
          const row = document.createElement('p'); row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.alignItems = 'center'; row.style.gap = '0.5rem'; row.style.marginBottom = '0.75rem';
          const name = document.createElement('span'); name.textContent = account.username + ' — ' + account.serverName + (account.current ? ' (session courante)' : '');
          row.append(name);
          if (data.accounts.length > 1) {
            const unlink = document.createElement('button'); unlink.className = 'btn btn-secondary'; unlink.textContent = 'Dissocier';
            unlink.addEventListener('click', () => run(unlink, async () => {
              await API.request('/api/me/accounts/' + encodeURIComponent(account.id), { method: 'DELETE' });
              await load(); status.textContent = 'Compte dissocié. Le prochain Wrapped utilisera les associations restantes.';
            })); row.append(unlink);
          }
          list.append(row);
        }
      };
      proof.addEventListener('click', () => run(proof, async () => {
        const data = await API.postJSON('/api/me/accounts/proof', {}); if (signal.aborted) return;
        code.hidden = false; code.textContent = data.code; status.textContent = 'Code personnel valable cinq minutes, utilisable une seule fois. Ne le partagez pas.';
        clearTimeout(expiryTimer); expiryTimer = setTimeout(() => { code.textContent = ''; status.textContent = 'Code expiré.'; }, data.expiresIn * 1000);
      }));
      form.addEventListener('submit', event => { event.preventDefault(); run(submit, async () => {
        await API.postJSON('/api/me/accounts/link', { code: input.value.trim() }); input.value = ''; await load(); status.textContent = 'Compte associé. Aucun droit supplémentaire accordé.';
      }); });
      await renderServerAdministration(card);
      await run(submit, load);
    }
  };
})();
