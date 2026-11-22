/*
 * newCoin - autoteste estatico (executado no navegador).
 */
(function () {
    'use strict';

    const botao = document.getElementById('btn-teste');
    const resultados = document.getElementById('resultados');

    function etapa(descricao, ok, detalhe) {
        const item = document.createElement('li');
        item.className = ok ? 'situacao-ok' : 'situacao-erro';
        item.textContent = (ok ? 'OK - ' : 'FALHA - ') + descricao +
            (detalhe ? ' :: ' + detalhe : '');
        resultados.appendChild(item);
    }

    async function executar() {
        resultados.textContent = '';
        try {
            await NewCoinStore.reiniciar();
            etapa('Estado de teste recriado', true);

            const bloco = await NewCoinStore.registrarTransacao({
                origem: 'Cleusa',
                destino: 'Wander',
                valor: 100,
                justificativa: 'Pagamento de consultoria (lastro da transacao)'
            });
            etapa('Hash automatico gerado para a nova transacao',
                /^[a-f0-9]{64}$/.test(bloco.transaction.hash), bloco.transaction.hash);

            const estado = await NewCoinStore.estadoAtual();
            const validacao = await NewCoin.Chain.deJSON(estado.periodoAtual.chain).validar();
            etapa('Corrente valida (hash, assinatura e encadeamento)',
                validacao.valido, validacao.erros.join('; ') || 'tudo conferiu');

            const adulterada = JSON.parse(JSON.stringify(bloco));
            adulterada.transaction.justificativa = 'justificativa adulterada';
            const validacaoAdulterada = await NewCoin.Block.deJSON(adulterada).validar();
            etapa('Adulteracao da justificativa detectada',
                !validacaoAdulterada.valido, validacaoAdulterada.erros.join('; '));

            const periodoAntes = estado.periodoAtual.id;
            const arquivo = await NewCoinStore.encerrarPeriodo('autoteste');
            const estadoDepois = await NewCoinStore.estadoAtual();
            etapa('Arquivo gerado com timestamp atual',
                Boolean(arquivo.criadoEm) && arquivo.periodosInvalidados.length === 1, arquivo.criadoEm);
            etapa('Hash do periodo gerado como lastro',
                /^[a-f0-9]{64}$/.test(arquivo.hashDoPeriodo), arquivo.hashDoPeriodo);
            etapa('Periodo antigo invalidado e novo periodo iniciado',
                arquivo.periodo.invalidado === true && periodoAntes !== estadoDepois.periodoAtual.id,
                periodoAntes + ' -> ' + estadoDepois.periodoAtual.id);
            etapa('Historico antigo preservado no arquivo',
                arquivo.periodo.chain.blocks.length === 2,
                'blocos arquivados: ' + arquivo.periodo.chain.blocks.length);
        } catch (erro) {
            etapa('Erro inesperado', false, erro.message);
        } finally {
            botao.disabled = false;
        }
    }

    botao.addEventListener('click', function () {
        botao.disabled = true;
        executar();
    });
})();
