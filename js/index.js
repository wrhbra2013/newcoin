//Importar biblioteca
const {cripto} = require('crypto');

//Classes principais

// Classe transação
class Transaction
{
    constructor(montante, sendPublicKey, receivePublicKey)
    {
        this.montante = montante;
        this.sendPublicKey = sendPublicKey;
        this.receivePublicKey = receivePublicKey;
    }
    toString()
    {
        return JSON.stringify(this);
    }
}

//Classe Bloco
class Block
{
    constructor(previousHash, transaction, timestamp = Date.now()){
        this.previousHash = previousHash;
        this.transaction = transaction;
        this.timestamp = timestamp;
    }
    getHash()
    {
        const json = JSON.stringify(this);
        const hash = cripto.createHash("SHA256");
        hash.update(json).end();
        const hex = hash.digest("hex");
        return hex;
    }
    toString()
    {
        JSON.stringify(this);
    }
}

//Classe Sequencia
class Chain
{
    static instance = new Chain();
    constructor()
    {
            this.chain = [new Block
           (
               "",new Transaction("0", "default", "default")
           )
       ];

    }
    getPreviousBlockHash()
    {
        return this.chain[this.chain.length -1].getHash();
    }
    insertBlock (transaction, senderPublicKey, sig)
    {
        const verify =  cripto.createVerify("SHA256");
        verify.update(transaction.toString());
        const isValid = verify.verify(senderPublicKey, sig);
        if (isValid)
        {
            const block = new Block(this.getPreviousBlockHash(), transaction);
            alert("Bloco adicionado", block.toString());
            this.chain.push(block);
        }

    }
}

//Classe Carteira
class Wallet
{
    constructor()
    {
        const keys = cripto.generateKeyPairSync("rsa",
            {
                modulusLength: 2048,
                publicKeyEncoding:
                {
                    type: "spki", format:"pem"

                },
                privateKeyEncoding:
                {
                    type: "pkcs8", format: "pem"
                },

            }

        );
        this.privateKey = keys.privateKey;
        this.publicKey = keys.publicKey;
    }
    send(montante, receivePublicKey)
    {
        const transaction = new Transaction(
            montante,
            this.publicKey,
            receivePublicKey
        );
        const shaSign = cripto.createSign("SHA256");
        shaSign.update(transaction.toString()).end();
        const signature = shaSign.sign(this.privateKey);
        Chain.instance.insertBlock(transaction,this.publicKey, signature);
    }

}


//Fim Classes

//testing
// let user = prompt("Digite seu nome: ");
// let valor = prompt("Digite um valor: ");
// let destino = prompt('Digite a pessoa recebedora: ');

// cleusa.send(100, wander.publicKey);
// wander.send(300, terceiro.publicKey);
// cleusa.send(300, terceiro.publicKey);
// terceiro.send(50, wander.publicKey);
// terceiro.send(50, cleusa.publicKey);
//
// console.log(Chain.instance);





