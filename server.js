const express = require('express');
const path = require('path');
const app = express();



app.use(express.urlencoded({ extended: false }));
app.use(express.static('js'));


app.get('/', function(request, response)
{

    response.sendFile(path.join(__dirname,'./newcoin.html'));

});

const porta = 3000;
const ATIVO = `http://localhost:${porta}`
app.listen(porta,function(){
    console.log(`Plataforma newCoin`,ATIVO,'...')
});
