var i2c, ina, wa, epoch = new Date();

var INA226 = require("INA226");
INA226.prototype.r3 = function() {
  return {
    u: this.rd(0x02) * 0.00125,
    p: this.rd(0x03) * 25000 * this.currentLSB,
    i: this.rds(0x04) * 1000 * this.currentLSB,
    o: (this.rd(0x06) & 4) !== 0
  };
};

function r3Print() {
  var i = ina.r3(); print(`${i.i.toFixed(4)} mA, ${i.u.toFixed(4)} V`);
}

/**
 *  Data format:
 *    'x' literal           1 byte
 *    timestamp in Uint32   4 byte
 *    measured values in float32: Voltage, Current, Power
 *                          3*4 byte
 *    overflow bool         1 byte
 *    'y\n' literal         2 byte
 *  Data length: (4 + 3*4 + 1) = 17 byte
 *  "packet" length: 1 + (4 + 3*4 + 1) + 2 = 20 byte
 */
function r3Send() {
  var i = ina.r3(); Bluetooth.write('x', new Int32Array([Math.round(new Date() - epoch)]).buffer, new Float32Array([i.u, i.i, i.p]).buffer, i.o, 'y\n');
}
function startSend() {
  stop();
  wa = setWatch(r3Send, D4, {edge: "falling", repeat: true});
  ina.r3();
}
function stop() {if (wa) {wa = clearWatch(wa);} }

function onInit() {
  i2c = I2C1;
  i2c.setup({sda: D11, scl: D5, bitrate: 400000});

  pinMode(D4, "input_pullup");
  ina = new INA226(i2c, {
    average: 16,
    // default conversion time: 1.1ms * 2 (Vbus & Shunt) => 454,5455 measurement / sec
    // 128,256,512 or 1024
    // avg 64:   7.18 sample/sec, 142.86ms/sample =>  140 byte / sec
    // avg 16:  28 sample/sec,  35.71ms/sample =>  560 byte / sec
    // avg  4: 112 sample/sec,   8.93ms/sample => 2240 byte / sec ==> maybe too much...
    // avg  1: 448 sample/sec ==> definitely too much, fastest connection interval is 7.5ms
    // INA 226 conversion time: 140us, 204us, 332us, 588us, 1100us (default)
    shunt: 1,
    maxCurrent: 0.082
  });
  NRF.on('disconnect', function() {stop(); digitalPulse(LED1, 1, 200);});
  NRF.on('connect', function() {digitalPulse(LED2, 1, 200);});
}
