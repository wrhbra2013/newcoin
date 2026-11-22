/*
 * newCoin - modelo do arquivo de valor monetario P2P offline.
 *
 * NotaValor:Unidade de valor assinada pelo emissor, com validade temporal.
 * ArquivoExclusao: invalida notas por timestamp posterior, assinado pelo emissor.
 * Ambos viajam como .json entre maquinas; a validacao e feita localmente.
 */
(function (global) {
    'use strict';

    const NC = global.NewCoin;
    const encoder = new TextEncoder();
    const algoritmo = 'RSASSA-PKCS1-v1_5';

    async function verificarAssinatura(chavePublicaPem, payload, assinaturaBase64) {
        const chave = await global.crypto.subtle.importKey(
            'spki',
            NC.deBase64(NC.dePem(chavePublicaPem)),
            { name: algoritmo, hash: 'SHA-256' },
            false,
            ['verify']
        );
        return global.crypto.subtle.verify(
            algoritmo,
            chave,
            NC.deBase64(assinaturaBase64),
            encoder.encode(NC.serializar(payload))
        );
    }

    class NotaValor {
        constructor(dados) {
            this.tipo = 'nota-valor';
            this.id = dados.id;
            this.valor = Number(dados.valor);
            this.moeda = dados.moeda || 'NC';
            this.portador = dados.portador;
            this.emissor = dados.emissor;
            this.criadoEm = dados.criadoEm;
            this.validoAte = dados.validoAte;
            this.justificativa = dados.justificativa;
            this.anterior = dados.anterior || '0';
            this.sequencia = Number(dados.sequencia) || 1;
            this.hash = dados.hash || null;
            this.assinatura = dados.assinatura || null;
            this.estado = dados.estado || { situacao: 'ativa' };
        }

        // Estado (inclusao/exclusao local) fica fora: nao pode alterar o hash da nota.
        payload() {
            return {
                tipo: this.tipo,
                id: this.id,
                valor: this.valor,
                moeda: this.moeda,
                portador: this.portador,
                emissor: this.emissor,
                criadoEm: this.criadoEm,
                validoAte: this.validoAte,
                justificativa: this.justificativa,
                anterior: this.anterior,
                sequencia: this.sequencia
            };
        }

        toJSON() {
            return Object.assign(this.payload(), {
                hash: this.hash,
                assinatura: this.assinatura,
                estado: this.estado
            });
        }

        static deJSON(objeto) {
            return new NotaValor(objeto);
        }

        async calcularHash() {
            return NC.sha256(this.payload());
        }

        async assinar(carteira) {
            this.assinatura = await carteira.assinar(this.payload());
            return this.assinatura;
        }

        // Checagem usada na importacao: estrutura, hash e assinatura.
        async verificarIntegridade() {
            const erros = [];
            if (this.hash !== await this.calcularHash()) {
                erros.push('hash da nota nao confere');
            }
            if (!this.assinatura || !await verificarAssinatura(this.emissor, this.payload(), this.assinatura)) {
                erros.push('assinatura do emissor invalida');
            }
            if (!Number.isFinite(this.valor) || this.valor <= 0) {
                erros.push('valor invalido');
            }
            if (!this.criadoEm || isNaN(Date.parse(this.criadoEm))) {
                erros.push('criadoEm invalido');
            }
            if (!this.validoAte || isNaN(Date.parse(this.validoAte))) {
                erros.push('validoAte invalido');
            }
            if (Date.parse(this.validoAte) <= Date.parse(this.criadoEm)) {
                erros.push('validade deve ser posterior a criacao');
            }
            if (!(this.sequencia >= 1)) {
                erros.push('sequencia invalida');
            }
            return { valido: erros.length === 0, erros: erros };
        }

        // Validacao completa: integridade + expiracao + exclusoes conhecidas.
        async validar(opcoes) {
            const config = opcoes || {};
            const integridade = await this.verificarIntegridade();
            const erros = integridade.erros.slice();
            const avisos = [];

            const agora = config.agora || NC.agoraISO();
            if (!isNaN(Date.parse(agora)) && Date.parse(agora) > Date.parse(this.validoAte)) {
                erros.push('nota expirada em ' + this.validoAte);
            }
            if (this.estado && this.estado.situacao === 'excluida') {
                erros.push('nota excluida localmente em ' + (this.estado.em || 'data desconhecida'));
            }

            (config.exclusoes || []).forEach((arquivo) => {
                (arquivo.notasExcluidas || []).forEach((item) => {
                    if (item.id === this.id && item.hash === this.hash) {
                        if (Date.parse(arquivo.criadoEm) > Date.parse(this.criadoEm)) {
                            erros.push('excluida pelo arquivo ' + arquivo.id + ' (' + arquivo.criadoEm + ')');
                        } else {
                            avisos.push('arquivo ' + arquivo.id + ' ignorado: timestamp nao posterior');
                        }
                    }
                });
            });

            if (!this.anterior || this.anterior === '0') {
                avisos.push('primeira nota da cadeia do emissor');
            }

            return { valido: erros.length === 0, erros: erros, avisos: avisos };
        }
    }

    class ArquivoExclusao {
        constructor(dados) {
            this.tipo = 'arquivo-exclusao';
            this.id = dados.id;
            this.criadoEm = dados.criadoEm;
            this.emissor = dados.emissor;
            this.notasExcluidas = dados.notasExcluidas || [];
            this.anteriorArquivo = dados.anteriorArquivo || '0';
            this.hash = dados.hash || null;
            this.assinatura = dados.assinatura || null;
        }

        payload() {
            return {
                tipo: this.tipo,
                id: this.id,
                criadoEm: this.criadoEm,
                emissor: this.emissor,
                notasExcluidas: this.notasExcluidas,
                anteriorArquivo: this.anteriorArquivo
            };
        }

        toJSON() {
            return Object.assign(this.payload(), {
                hash: this.hash,
                assinatura: this.assinatura
            });
        }

        static deJSON(objeto) {
            return new ArquivoExclusao(objeto);
        }

        async calcularHash() {
            return NC.sha256(this.payload());
        }

        async assinar(carteira) {
            this.assinatura = await carteira.assinar(this.payload());
            return this.assinatura;
        }

        async validar() {
            const erros = [];
            if (this.hash !== await this.calcularHash()) {
                erros.push('hash do arquivo nao confere');
            }
            if (!this.assinatura || !await verificarAssinatura(this.emissor, this.payload(), this.assinatura)) {
                erros.push('assinatura do emissor invalida');
            }
            if (!this.criadoEm || isNaN(Date.parse(this.criadoEm))) {
                erros.push('criadoEm invalido');
            }
            if (!this.notasExcluidas.length) {
                erros.push('arquivo sem notas excluidas');
            }
            return { valido: erros.length === 0, erros: erros };
        }
    }

    global.NewCoinNotas = {
        NotaValor: NotaValor,
        ArquivoExclusao: ArquivoExclusao,
        verificarAssinatura: verificarAssinatura
    };
})(window);
