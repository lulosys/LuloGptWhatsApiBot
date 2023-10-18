require('dotenv').config()
const express = require('express')
const app = express()
const { CoreClass } = require('@bot-whatsapp/bot')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')
const ChatGPTClass = require('./chatgpt.class')
const QRPortalWeb = require('@bot-whatsapp/portal')
const fs = require('fs');
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
const cors = require('cors')

app.use(express.static(__dirname+'' ))

// app.use(function(req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   next();
// });

const corsOptions = {
  origin: '*', // dominio permitido
  methods: ['GET', 'POST', 'PUT'] // métodos HTTP permitidos
};

app.use(cors(corsOptions)); 

const TOKEN_PASSWORD = process.env.TOKEN_PASSWORD

const main = async () => {
  
  const adapterDB = await new MockAdapter()
  const adapterProvider = await new BaileysProvider({});

  const bot = new ChatGPTClass(adapterDB, adapterProvider);
  const port = process.env.PORT || 3000
  // QRPortalWeb()
 
  
  app.get('/require-scan', function(req, res) {
    res.send(!bot.isReady());
  });

  app.get('/qr', function(req, res) {
  
    res.sendFile( __dirname+`/bot.qr.png`);
  });


  app.get('/get-current-config', function(req, res) {
    let token = req.query.token |""
    if(!hasAuthority(token)) return res.send("unauthorized")
    
    if(bot.isReady()){
     bot.getAllConfig(res)       
    }else{
      res.send(false);
    }            
  });

  app.post('/set-all-config', async function (req, res) {
   
    let token = req.body.token||""
    if(!hasAuthority(token)) return res.send("unauthorized")

    if(bot.isReady()){

      let InitProntAssist = req.body.InitProntAssist
      let PostProntAssist = req.body.PostProntAssist
      let timeOutSessionAssist = req.body.timeOutSessionAssist
      let ActiveAssist = req.body.ActiveAssist
      let InitHourAssist = req.body.InitHourAssist
      let EndHourAssist = req.body.EndHourAssist
  
    
      await bot.setAllConfig({
        InitProntAssist,PostProntAssist,timeOutSessionAssist,ActiveAssist,InitHourAssist,EndHourAssist
      })
        res.send(true)
      
    }else{
      res.send(false)
    }

  })

  app.get('/redis-set', async function (req, res) {
    
    let token = req.query.token||""
    if(!hasAuthority(token)) return res.send("unauthorized")

    if(bot.isReady()){
      let key = req.query.key
      let value = req.query.value
  
      if(key && value){
        await bot.setRedis(key,value);
        res.send(true)
      }else{
        res.send(false)
      }
    }else{
      res.send(false)
    }

  })

  app.get('/redis-get', async function (req, res) {

    let token = req.query.token||""
    if(!hasAuthority(token)) return res.send("unauthorized")

    if(bot.isReady()){
      let key = req.query.key
      await bot.getRedis(key,res)
    }else{
      res.send(false)
    }
    
  })
  
  app.get('/ping', function (req, res) {
    res.send(true)
  })

  app.post('/send', function (req, res) {

    let token = req.query.token||""
    if(!hasAuthority(token)) return res.send("unauthorized")
    

    try {

      if(bot.isReady()){
        
        let phone = req.body.phone
        let message = req.body.message
        
        console.log("Send api message to: "+phone)
        console.log(message)

        const patronTelefono = /^[0-9]{12}$/;

        if( phone && message && patronTelefono.test(phone) ){
    
          bot.sendFlowSimple([{ answer: message}], phone);
          res.send(true)
    
        }else{

          res.send(false)
        
        }
        
      }else{

        res.send(false)
      
      }

    } catch (error) {
      res.send(false)
    }
      
  })

  app.listen(port, () => {
    console.log(`Api ready.`)
  })



  adapterProvider.on('ready', async () => { });

 
}

function hasAuthority(token){
  return !(token != TOKEN_PASSWORD && process.env.APP_MODE == "PROD" && TOKEN_PASSWORD != null)
}

main()
