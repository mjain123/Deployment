var http      = require('http');
var httpProxy = require('http-proxy');
var exec = require('child_process').exec;
var request = require("request");
var express = require('express');
var app = express()
var GREEN = 'http://127.0.0.1:8003';
var BLUE  = 'http://127.0.0.1:8002';
var redis = require('redis');
var greenclient = redis.createClient(6380, '127.0.0.1', {});
var blueclient = redis.createClient(6379, '127.0.0.1', {});

var PRIMARYTARGET = BLUE;
var SECONDARYTARGET = GREEN;


var flag = 1; //on flag = 1 (to mirror blue and green slice)

var infrastructure =
{
  setup: function()
  {
    // Proxy.
    var options = {};
    var proxy   = httpProxy.createProxyServer(options);

    app.get('/switch', function(req, res){ // switch between blue and green slices.
    if(PRIMARYTARGET===BLUE) 
      {
            blueclient.lrange('images', 0, -1, function (error, items) { 
            // get images from redis primary 
            if (error) console.log("error");
            else {
               greenclient.del('images');
               items.forEach(function (item) {
                  greenclient.rpush("images",item);
                })
          }
       }) 
        // console.log("migrated");
        PRIMARYTARGET = GREEN;
        SECONDARYTARGET = BLUE;
        res.send("BLUE TO GREEN SWITCH DONE SUCCESSFULLY");
      }
    else
      {
        
        greenclient.lrange('images', 0, -1, function (error, items) {
            if (error) console.log("error");
            else {
               blueclient.del('images');
               items.forEach(function (item) {
                  blueclient.rpush("images",item);
              })
            }
          })
        
        PRIMARYTARGET = BLUE;
        SECONDARYTARGET = GREEN;
        res.send("GREEN TO BLUE SWITCH DONE SUCCESSFULLY");
      }

    });


    app.all('/*', function(req, res, next) {
       if(flag==1)
        {
          if(req.method=='get')
            req.pipe(request.get(SECONDARYTARGET+req.url))
          else if (req.method=='post')
            req.pipe(request.post(SECONDARYTARGET+req.url))
        }
       proxy.web(req, res, { target: PRIMARYTARGET });

    });

    app.listen(8001,'localhost');
    // Launch blue slice
    exec('forever start deploy/blue-www/main.js 8002');
    console.log("blue slice");

    // Launch green slice
    exec('forever start deploy/green-www/main.js 8003');
    console.log("green slice");


  },

  teardown: function()
  {
    exec('forever stopall', function()
    {
      console.log("infrastructure shutdown");
      process.exit();
    });
  },
}

infrastructure.setup();

// Make sure to clean up.
process.on('exit', function(){infrastructure.teardown();} );
process.on('SIGINT', function(){infrastructure.teardown();} );
process.on('uncaughtException', function(err){
  console.log(err);
  // infrastructure.teardown();
} );
