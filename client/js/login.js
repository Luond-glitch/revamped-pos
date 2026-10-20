$('#f').onsubmit = async e => { e.preventDefault(); try { await API.login($('#email').value, $('#pw').value); location.href = 'dashboard.html'; } catch (x) { $('#err').textContent = x.message; } };
