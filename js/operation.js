/*
 * newCoin - ligacao entre o formulario e o nucleo (pagina newcoin.html).
 */
(function () {
    'use strict';

    const form = document.getElementById('form-transacao');
    const status = document.getElementById('status');
    const campoOrigem = document.getElementById('origem');
    const campoDestino = document.getElementById('destino');
    const campoValor = document.getElementById('valor');
    const campoJustificativa = document.getElementById('justificativa');
    const botao = form.querySelector('button[type="submit"]');

    function mensagem(texto, tipo) {
        status.textContent = texto;
        status.className = 'status ' + (tipo || '');
    }

    async function atualizarCabecalho() {
        const estado = await NewCoinStore.estadoAtual();
        const carteiraAtual = await NewCoinStore.carteira();
        document.getElementById('periodo-id').textContent = estado.periodoAtual.id;
        document.getElementById('periodo-inicio').textContent = estado.periodoAtual.iniciadoEm;
        document.getElementById('carteira-chave').textContent = carteiraAtual.publicKeyPem;
    }

    form.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        botao.disabled = true;
        mensagem('Gerando hash, assinando e gravando transacao...', 'info');

        try {
            const valor = Number(campoValor.value);
            if (!Number.isFinite(valor) || valor <= 0) {
                throw new Error('Informe um valor numérico maior que zero.');
            }
            const origem = campoOrigem.value.trim();
            const destino = campoDestino.value.trim();
            const justificativa = campoJustificativa.value.trim();
            if (!origem || !destino || !justificativa) {
                throw new Error('Origem, destino e justificativa sao obrigatorios.');
            }

            const bloco = await NewCoinStore.registrarTransacao({
                origem: origem,
                destino: destino,
                valor: valor,
                justificativa: justificativa
            });

            mensagem('Transacao registrada. Hash: ' + bloco.transaction.hash, 'ok');
            form.reset();
            await atualizarCabecalho();
        } catch (erro) {
            mensagem('Falha: ' + erro.message, 'erro');
        } finally {
            botao.disabled = false;
        }
    });

    atualizarCabecalho().catch(function (erro) {
        mensagem('Falha ao iniciar: ' + erro.message, 'erro');
    });
})();
