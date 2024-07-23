const wallet = new Wallet();

//Client Side
const btn = document.getElementById('submit');

btn.addEventListener('click', function novo()
{
     let user = document.getElementById("origem").value;
     let dest = document.getElementById("destino").value;
     let val = document.getElementById("valor").value;

    user = wallet;
    user.send(valor , destino.publicKey);

});
