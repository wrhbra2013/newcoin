/*
 * newCoin - persistencia local do prototipo estatico (localStorage).
 *
 * Estado = periodo atual + arquivos de periodos encerrados.
 * Ao encerrar um periodo, um arquivo com timestamp atual (criadoEm) invalida
 * as datas/transacoes antigas, que permanecem arquivadas para auditoria.
 */
(function (global) {
    'use strict';

    const NewCoin = global.NewCoin;
    const { Chain, Block, Wallet, sha256, agoraISO, novoId } = NewCoin;
    const CHAVE_ESTADO = 'newcoin.estado.v1';
    const CHAVE_CARTEIRA = 'newcoin.carreira.v1';

    function salvarEstado(estado) {
        global.localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estado));
    }

    async function estadoNovo() {
        const id = novoId('periodo');
        const chain = await Chain.novo(id);
        return {
            versao: 1,
            periodoAtual: {
                id: id,
                iniciadoEm: agoraISO(),
                encerradoEm: null,
                chain: chain.toJSON()
            },
            arquivos: []
        };
    }

    async function carregarEstado() {
        const bruto = global.localStorage.getItem(CHAVE_ESTADO);
        if (bruto) {
            try {
                const estado = JSON.parse(bruto);
                if (estado && estado.periodoAtual && estado.periodoAtual.chain) {
                    return estado;
                }
            } catch (erro) {
                // Estado corrompido: recriado abaixo.
            }
        }
        const estado = await estadoNovo();
        salvarEstado(estado);
        return estado;
    }

    async function carteira() {
        const bruto = global.localStorage.getItem(CHAVE_CARTEIRA);
        if (bruto) {
            const dados = JSON.parse(bruto);
            return new Wallet(dados.publicKeyPem, dados.privateKeyPem);
        }
        const carteira = await Wallet.gerar();
        global.localStorage.setItem(CHAVE_CARTEIRA, JSON.stringify({
            publicKeyPem: carteira.publicKeyPem,
            privateKeyPem: carteira.privateKeyPem
        }));
        return carteira;
    }

    async function registrarTransacao(dados) {
        const estado = await carregarEstado();
        const chain = Chain.deJSON(estado.periodoAtual.chain);
        const carteiraAtual = await carteira();
        const bloco = await carteiraAtual.send({
            origem: dados.origem,
            destino: dados.destino,
            valor: dados.valor,
            justificativa: dados.justificativa,
            chain: chain
        });
        estado.periodoAtual.chain = chain.toJSON();
        salvarEstado(estado);
        return bloco.toJSON();
    }

    async function encerrarPeriodo(motivo) {
        const estado = await carregarEstado();
        const atual = estado.periodoAtual;
        const chain = Chain.deJSON(atual.chain);
        const validacao = await chain.validar();
        const encerradoEm = agoraISO();
        const transacoes = Math.max(0, chain.blocks.length - 1);
        const idArquivo = novoId('arquivo');

        const arquivo = {
            tipo: 'arquivo-periodo',
            id: idArquivo,
            criadoEm: encerradoEm,
            periodoId: atual.id,
            iniciadoEm: atual.iniciadoEm,
            encerradoEm: encerradoEm,
            motivo: motivo || 'Encerramento de periodo (teste)',
            quantidadeTransacoes: transacoes,
            hashDoPeriodo: await sha256(atual.chain),
            hashDoArquivoAnterior: estado.arquivos.length
                ? estado.arquivos[estado.arquivos.length - 1].hashDoArquivo
                : '0',
            periodosInvalidados: [{
                periodoId: atual.id,
                iniciadoEm: atual.iniciadoEm,
                encerradoEm: encerradoEm,
                transacoes: transacoes,
                invalidadoEm: encerradoEm,
                invalidadoPor: idArquivo
            }],
            validacao: validacao,
            periodo: Object.assign({}, atual, {
                invalidado: true,
                invalidadoEm: encerradoEm,
                invalidadoPor: idArquivo,
                chain: atual.chain
            })
        };
        arquivo.hashDoArquivo = await sha256(arquivo);

        estado.arquivos.push(arquivo);
        estado.periodoAtual = (await estadoNovo()).periodoAtual;
        salvarEstado(estado);
        return arquivo;
    }

    async function comprovante(blocoJSON) {
        const bloco = Block.deJSON(blocoJSON);
        const validacao = await bloco.validar();
        return {
            tipo: 'comprovante-transacao',
            geradoEm: agoraISO(),
            verificacao: validacao,
            bloco: bloco.toJSON()
        };
    }

    async function validarPeriodoAtual() {
        const estado = await carregarEstado();
        return Chain.deJSON(estado.periodoAtual.chain).validar();
    }

    function baixarJSON(nomeArquivo, objeto) {
        const conteudo = JSON.stringify(objeto, null, 2);
        const blob = new Blob([conteudo], { type: 'application/json;charset=utf-8' });
        const url = global.URL.createObjectURL(blob);
        const link = global.document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        global.document.body.appendChild(link);
        link.click();
        link.remove();
        global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
    }

    async function reiniciar() {
        global.localStorage.removeItem(CHAVE_ESTADO);
        global.localStorage.removeItem(CHAVE_CARTEIRA);
        await carregarEstado();
    }

    global.NewCoinStore = {
        estadoAtual: carregarEstado,
        carteira: carteira,
        registrarTransacao: registrarTransacao,
        encerrarPeriodo: encerrarPeriodo,
        comprovante: comprovante,
        validarPeriodoAtual: validarPeriodoAtual,
        baixarJSON: baixarJSON,
        reiniciar: reiniciar
    };
})(window);
