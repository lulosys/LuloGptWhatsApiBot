const  {CoreClass} = require("@bot-whatsapp/bot");
const express = require('express')
const app = express()

const readline = require('readline');
var redis = require("redis");

const { MongoClient, ServerApiVersion } = require('mongodb');
const { Console } = require("console");
const ObjectID = require('mongodb').ObjectID;
var isReady = false;
//Mongo DB

const DATABASE = process.env.MONGO_DATABASE || "Bots";
const uriMongo = process.env.MONGO_URI;

const Mongoclient = new MongoClient(uriMongo, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
var BotsCollection = null

//Redis
var Redisclient = redis.createClient( process.env.REDIS_PORT, process.env.REDIS_URI,{no_ready_check: true}); 

const APP_MODE = process.env.APP_MODE||"TEST"

const InitProntAssist = APP_MODE+"InitProntAssist"
const timeOutSessionAssist =  APP_MODE+"timeOutSessionAssist"
const ActiveAssist =  APP_MODE+"ActiveAssist"
const InitHourAssist =  APP_MODE+"InitHourAssist"
const EndHourAssist =  APP_MODE+"EndHourAssist"
const PostProntAssist =  APP_MODE+"PostProntAssist"


class ChatGPTClass extends CoreClass {

    openai = undefined;

    constructor  (_database, _provider) {

        super (null, _database, _provider);
        this.init().then();

        this.providerClass.on('ready', () => {
            this.handleReadyEvent();
            isReady = true;
        });

        this.providerClass.on('require_action', async () => {
            isReady = false;
        })
      
    }

    isReady = () => {

      return isReady
    
    }

    handleReadyEvent() {

        Mongoclient.connect( async err => {
            console.log("Mongo Conectado.");
            BotsCollection = Mongoclient.db(DATABASE).collection("Bots");
            if(err){ console.log(err) } else {
                this.ready = true
            }
        });

        Redisclient.auth( process.env.REDIS_PASSWORD, function (err) { 
            console.log("Redis Conectado.");
            if (err) { console.log(err) }
        }); 
    
       
    }

    async setAllConfig(obj) {
        if(obj.InitProntAssist) await Redisclient.set(InitProntAssist, obj.InitProntAssist);
        if(obj.PostProntAssist) await Redisclient.set(PostProntAssist, obj.PostProntAssist);
        if(obj.timeOutSessionAssist) await Redisclient.set(timeOutSessionAssist, obj.timeOutSessionAssist);
        if(obj.ActiveAssist) await Redisclient.set(ActiveAssist, obj.ActiveAssist);
        if(obj.InitHourAssist) await Redisclient.set(InitHourAssist, obj.InitHourAssist);
        if(obj.EndHourAssist) await Redisclient.set(EndHourAssist, obj.EndHourAssist);
    }
 
    async setRedis(key,message) {
        await Redisclient.set(APP_MODE+key, message);
    }

    async getRedis(key,res){
       await Redisclient.get(APP_MODE+key, function(err, reply) {
         res.send(reply)
       });
    }
   
    async getAllConfig(res){
        Redisclient.get( ActiveAssist, async (err, ActiveAssist ) => {
            Redisclient.get( InitHourAssist, async (err, InitHourAssist) => {
              Redisclient.get( EndHourAssist, async (err, EndHourAssist) => {
                Redisclient.get( InitProntAssist, async (err, InitProntAssist) => {
                Redisclient.get( PostProntAssist, async (err, PostProntAssist) => {
                  Redisclient.get( timeOutSessionAssist, async (err, timeOutSessionAssist) => {
                    res.send({
                        ActiveAssist,
                        InitHourAssist,
                        EndHourAssist,
                        InitProntAssist,
                        PostProntAssist,
                        timeOutSessionAssist,
                        APP_MODE
                    })
                  });
                });
                });
              });
            });
        }); 
    }



    //Iniciando
    init = async () => {

        const { ChatGPTAPI} = await import ("chatgpt");
        this.openai = new ChatGPTAPI ({

            apiKey:  process.env.TOKEN_OPENIA,
            completionParams: {
                temperature: 0.8,
                top_p: 1,
                presence_penalty: 1,
                model: "gpt-3.5-turbo"
            }
       
        });
        
          
    };
    

    handleMsg = async (ctx) =>  {

        const { from, body } = ctx;

        console.log(body)

        if(!body){
            return;
        }

        if(body.includes("_event_") || body.trim() === ""){
            console.log("unanswered")
            return;
        }

        if( BotsCollection != null ){

          Redisclient.get( ActiveAssist, async (err, active ) => {
            active = active||"false"

            if(active != "true"){
                console.log("inactive")
                return;
            }
                
                Redisclient.get( InitHourAssist, async (err, InitHour) => {
                    Redisclient.get( EndHourAssist, async (err, EndHour) => {
                        InitHour = parseInt(InitHour||18)
                        EndHour = parseInt(EndHour||6)

                        if(!this.isCurrentTimeInRange(InitHour,EndHour)){
                            console.log("out of time")
                            return;
                        }


                            Redisclient.get( InitProntAssist, async (err, initPront) => {
                            Redisclient.get( PostProntAssist, async (err, postPront) => {

                                Redisclient.get( timeOutSessionAssist, async (err, timeoutSession) => {
                                    
                                    const timeout =  timeoutSession || 30
                
                                    let completion;
                                    let user = await BotsCollection.find({ phone: from }).toArray();
                                    let newUser = false;
                                    if( user.length == 0 ) { user = await this.createUser(from); newUser = true} 
                
                
                                    if(body == "end" || body == "End"){
                                        return this.cleanTopic(from,body,user[0],timeout);
                                    }
                
                                    let minutes = this.getMinutesSinceLastTime((!user[0]) ? undefined :user[0].lastTime)
                
                                    if( minutes >= timeout || newUser == true ) completion = await this.newTopic(from,body,initPront,user[0],postPront)      
                                    else completion = await this.addTopic(from,body,user[0])  
                            
                                    this.sendFlowSimple([{answer: completion.text}], from);
                    
                                });
                        
                            });
                            });

                       

                    });
                });
            
            
          });

        }
       
        
    };
    
    
    isCurrentTimeInRange = (startDate, endDate) => {
        let currentDate = new Date();
        currentDate = currentDate.getHours()

        let isInRangue = false;
        if (startDate < endDate) {
            isInRangue = currentDate >= startDate && currentDate < endDate;
        } else {
            isInRangue = currentDate >= startDate || currentDate < endDate;
        }

        return isInRangue
    }

    cleanTopic = async (from,body,user,timeout)=>{
        const now = new Date();
        const delayed = new Date(now.getTime() - timeout * 60000);
        await BotsCollection.updateOne(
            { _id: new ObjectID( user._id) },
            { $set:  { phone: from, session: [], history: [...user.history, "\nClent:"+body+"\nSystem:Sesión Finalizada.", ],lastTime: delayed }},
            { upsert: true }
        )
        return this.sendFlowSimple([{answer: "Sesión Finalizada."}], from);
    }

    createUser = async (from) => {
        
        await BotsCollection.insertOne({
            phone: from,
            session: [],
            history: [],
            lastTime: new Date()
        });
        return await BotsCollection.find({ phone: from }).toArray();
    }


    newTopic = async (from, body, initPront,user,postPront) => {

        postPront = postPront||""
        let mensaje = initPront+"\n"+postPront+"\n"+body
        let completion = await this.sendChatGpt( mensaje, null )

        await BotsCollection.updateOne(
            { _id: new ObjectID( user._id) },
            { $set:  { phone: from, session: [completion], history: [...user.history, "System:Nueva sesión iniciada.\nClent:"+mensaje, "AI:"+completion.text], lastTime: new Date()}},
            { upsert: true }
        )
        
        this.sendFlowSimple([{answer: "Nueva sesión iniciada."}], from);
        this.sendFlowSimple([{answer: "puedes escribir 'End' para cambiar de tema."}], from);
        return completion

    }

    addTopic = async (from,body,user) => {
        let completion = await this.sendChatGpt( body, user.session[user.session.length-1] )
        await BotsCollection.updateOne(
          { _id: new ObjectID(user._id) },
          { $set:  { phone: from, session: [...user.session,completion], history: [...user.history, "Clent:"+body, "AI:"+completion.text], lastTime: new Date()}},
          { upsert: true }
        )
        return completion
    }

    
  getMinutesSinceLastTime = (lastTime) => {
    const now = new Date();
    if (!lastTime) {
      lastTime = now;
      return 0;
    } else {
      const diff = (now - lastTime) / 1000 / 60;
      lastTime = now;
      return Math.floor(diff);
    }
  }

    sendChatGpt = async (message,obj) => {
        
        console.log("await gpt response ... ")
        let completion = await this.openai.sendMessage(message, {
            conversationId: (!obj) ? undefined :obj.conversationId,
            parentMessageId: (!obj) ? undefined :obj.id,
            
        });
        console.log("gpt response is Ok ")
        
        return completion
    }
    
    
}



module.exports = ChatGPTClass;