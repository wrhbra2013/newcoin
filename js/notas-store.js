/*
 * newCoin - armazenamento e operacoes das notas de valor (prototipo offline).
 * Notas e arquivos de exclusao ficam em localStorage e podem ser exportados
 * como .json para transferencia P2P entre maquinas.
 */
(function (global) {
    'use strict';

    const NC = global.NewCoin;
    const { NotaValor, ArquivoExclusao } = global.NewCoinNotas;
    const CHAVE = 'newcoin.notas.v1';

    function estadoVazio() {
        return { versao: 1, notas: [], exclusoes: [] };
    }

    function carregar() {
        const bruto = global.localStorage.getItem(CHAVE);
        if (!bruto) {
            return estadoVazio();
        }
        try {
            const estado = JSON.parse(bruto);
            if (estado && Array.isArray(estado.notas) && Array.isArray(estado.exclusoes)) {
                return estado;
            }
        } catch (erro) {
            // Estado corrompido: reinicia abaixo.
        }
        return estadoVazio();
    }

    function salvar(estado) {
        global.localStorage.setItem(CHAVE, JSON.stringify(estado));
    }

    // Inclusao monotônica: a sequencia do emissor so avanca, nunca repete ou volta.
    function checarSequencia(nota, notasConhecidas) {
        const erros = [];
        const avisos = [];
        const doEmissor = notasConhecidas.filter((item) =>
            item.emissor === nota.emissor && item.id !== nota.id);
        const ultima = doEmissor.reduce((maior, item) => Math.max(maior, item.sequencia || 0), 0);

        if (ultima && nota.sequencia <= ultima) {
            erros.push('sequencia ' + nota.sequencia + ' nao e maior que a ultima conhecida (' + ultima + ')');
        }
        if (nota.sequencia > 1) {
            const anterior = doEmissor.find((item) => item.sequencia === nota.sequencia - 1);
            if (!anterior) {
                avisos.push('nota anterior (sequencia ' + (nota.sequencia - 1) + ') nao esta na carteira local');
            } else if (anterior.hash !== nota.anterior) {
                erros.push('anterior nao corresponde ao hash da nota de sequencia ' + (nota.sequencia - 1));
            }
        }
        if (ultima && nota.sequencia > ultima + 1) {
            avisos.push('lacuna na sequencia: faltam notas entre ' + ultima + ' e ' + nota.sequencia);
        }
        return { erros: erros, avisos: avisos };
    }

    async function emitir(dados) {
        const carteira = await global.NewCoinStore.carteira();
        const valor = Number(dados.valor);
        if (!Number.isFinite(valor) || valor <= 0) {
            throw new Error('Informe um valor numerico maior que zero.');
        }
        const dias = Number(dados.dias);
        if (!Number.isFinite(dias) || dias < 1) {
            throw new Error('A validade deve ser de pelo menos 1 dia.');
        }

        const estado = carregar();
        const notasDoEmissor = estado.notas.filter((nota) => nota.emissor === carteira.publicKeyPem);
        const sequencia = notasDoEmissor.reduce((maior, nota) => Math.max(maior, nota.sequencia || 0), 0) + 1;
        const anterior = notasDoEmissor.length ? notasDoEmissor[notasDoEmissor.length - 1].hash : '0';
        const criadoEm = NC.agoraISO();
        const validoAte = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

        const nota = new NotaValor({
            id: NC.novoId('ncv'),
            valor: valor,
            moeda: (dados.moeda || 'NC').trim() || 'NC',
            portador: (dados.portador || '').trim() || carteira.publicKeyPem,
            emissor: carteira.publicKeyPem,
            criadoEm: criadoEm,
            validoAte: validoAte,
            justificativa: (dados.justificativa || '').trim(),
            anterior: anterior,
            sequencia: sequencia
        });
        nota.hash = await nota.calcularHash();
        await nota.assinar(carteira);

        estado.notas.push(nota.toJSON());
        salvar(estado);
        return nota.toJSON();
    }

    async function excluir(dados) {
        const carteira = await global.NewCoinStore.carteira();
        const estado = carregar();
        const nota = estado.notas.find((item) => item.id === dados.id);
        if (!nota) {
            throw new Error('Nota nao encontrada.');
        }
        if (nota.emissor !== carteira.publicKeyPem) {
            throw new Error('Apenas o emissor pode excluir esta nota.');
        }
        if (nota.estado && nota.estado.situacao === 'excluida') {
            throw new Error('Esta nota ja foi excluida.');
        }

        // Garante timestamp estritamente posterior ao da nota (mesmo em operacoes rapidas).
        let criadoEm = NC.agoraISO();
        if (Date.parse(criadoEm) <= Date.parse(nota.criadoEm)) {
            criadoEm = new Date(Date.parse(nota.criadoEm) + 1).toISOString();
        }

        const arquivo = new ArquivoExclusao({
            id: NC.novoId('exclusao'),
            criadoEm: criadoEm,
            emissor: carteira.publicKeyPem,
            notasExcluidas: [{
                id: nota.id,
                hash: nota.hash,
                motivo: (dados.motivo || '').trim() || 'Exclusao por timestamp atual'
            }],
            anteriorArquivo: estado.exclusoes.length
                ? estado.exclusoes[estado.exclusoes.length - 1].hash
                : '0'
        });
        arquivo.hash = await arquivo.calcularHash();
        await arquivo.assinar(carteira);

        estado.exclusoes.push(arquivo.toJSON());
        nota.estado = {
            situacao: 'excluida',
            em: arquivo.criadoEm,
            arquivo: arquivo.id,
            motivo: arquivo.notasExcluidas[0].motivo
        };
        salvar(estado);
        return arquivo.toJSON();
    }

    async function importar(objeto) {
        if (!objeto || typeof objeto !== 'object') {
            throw new Error('Arquivo invalido: esperado um objeto JSON.');
        }
        const estado = carregar();

        if (objeto.tipo === 'nota-valor') {
            const nota = NotaValor.deJSON(objeto);
            const integridade = await nota.verificarIntegridade();
            if (!integridade.valido) {
                throw new Error('Nota rejeitada: ' + integridade.erros.join('; '));
            }
            if (estado.notas.some((item) => item.id === nota.id && item.hash === nota.hash)) {
                return { tipo: 'nota', mensagem: 'Nota ja estava na carteira local.', nota: nota.toJSON() };
            }
            const sequencia = checarSequencia(nota, estado.notas);
            if (sequencia.erros.length) {
                throw new Error('Nota rejeitada: ' + sequencia.erros.join('; '));
            }
            estado.notas.push(nota.toJSON());
            salvar(estado);
            return {
                tipo: 'nota',
                mensagem: 'Nota importada e verificada.',
                nota: nota.toJSON(),
                avisos: sequencia.avisos
            };
        }

        if (objeto.tipo === 'arquivo-exclusao') {
            const arquivo = ArquivoExclusao.deJSON(objeto);
            const validacao = await arquivo.validar();
            if (!validacao.valido) {
                throw new Error('Arquivo de exclusao rejeitado: ' + validacao.erros.join('; '));
            }
            if (estado.exclusoes.some((item) => item.id === arquivo.id)) {
                return { tipo: 'arquivo', mensagem: 'Arquivo de exclusao ja registrado.' };
            }
            estado.exclusoes.push(arquivo.toJSON());
            const avisos = [];
            arquivo.notasExcluidas.forEach((item) => {
                const nota = estado.notas.find((registro) => registro.id === item.id && registro.hash === item.hash);
                if (!nota) {
                    avisos.push('Nota ' + item.id + ' nao estava na carteira local; exclusao registrada para futura importacao.');
                    return;
                }
                if (Date.parse(arquivo.criadoEm) > Date.parse(nota.criadoEm)) {
                    nota.estado = {
                        situacao: 'excluida',
                        em: arquivo.criadoEm,
                        arquivo: arquivo.id,
                        motivo: item.motivo
                    };
                } else {
                    avisos.push('Exclusao de ' + item.id + ' ignorada: timestamp nao e posterior a nota.');
                }
            });
            salvar(estado);
            return { tipo: 'arquivo', mensagem: 'Arquivo de exclusao importado.', avisos: avisos };
        }

        throw new Error('Tipo de arquivo desconhecido: ' + String(objeto.tipo));
    }

    async function validarNota(notaJSON) {
        const estado = carregar();
        const nota = NotaValor.deJSON(notaJSON);
        const resultado = await nota.validar({ exclusoes: estado.exclusoes });
        const sequencia = checarSequencia(nota, estado.notas);
        return {
            valido: resultado.valido && sequencia.erros.length === 0,
            erros: resultado.erros.concat(sequencia.erros),
            avisos: resultado.avisos.concat(sequencia.avisos)
        };
    }

    function baixarNota(nota) {
        global.NewCoinStore.baixarJSON('nota-' + nota.id + '.json', nota);
    }

    function baixarExclusao(arquivo) {
        global.NewCoinStore.baixarJSON('exclusao-' + arquivo.id + '.json', arquivo);
    }

    function reiniciar() {
        global.localStorage.removeItem(CHAVE);
    }

    global.NewCoinNotasStore = {
        carregar: carregar,
        emitir: emitir,
        excluir: excluir,
        importar: importar,
        validarNota: validarNota,
        baixarNota: baixarNota,
        baixarExclusao: baixarExclusao,
        reiniciar: reiniciar
    };
})(window);
