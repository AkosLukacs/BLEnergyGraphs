/// random data for testing
const btnRandom = document.getElementById('btnRandom')
btnRandom.addEventListener('click', function() {
  const t0 = new Date().getTime()
  const back = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  const times = back.map(x => new Date(t0 - x * 150));
  const voltages = back.map(_ => 3.3 + Math.random() * 0.1)
  const currents = back.map(_ => 1.1 + Math.random() * 0.1)
  const powers = back.map((_, ix) => voltages[ix] * currents[ix])
  Plotly.extendTraces(
    graphDiv,
    {
      y: [voltages, currents, powers],
      x: [times, times, times]
    },
    [0, 1, 2]
  );
})
/// /random data for testing

const PLOT_REFRESH_INTERVAL = 333;

// label texts
const LBL_CURRENT = "Current [mA]";
const LBL_POWER = "Power [mW]";
const LBL_VOLTAGE = "Voltage [V]";


// buttons & labels
const graphDiv = document.getElementById('graph');
const btnConnect = document.getElementById('btnConnect')
const btnDisconnect = document.getElementById('btnDisconnect')
const chkAutoExtend = document.getElementById('chkAutoExtend')
const btnStart = document.getElementById('btnStart')
const btnStop = document.getElementById('btnStop')
const btnClear = document.getElementById('btnClear')

const s1 = document.getElementById('s1')

// latest values
const sU = document.getElementById('s_u')
const sI = document.getElementById('s_i')
const sP = document.getElementById('s_p')
const sCnt = document.getElementById('s_cnt')
const sDt = document.getElementById('s_dt')

// visible (depends on current zoom level)
const sVisU = document.getElementById('s_vis_u')
const sVisI = document.getElementById('s_vis_i')
const sVisP = document.getElementById('s_vis_p')
const sVisCnt = document.getElementById('s_vis_cnt')
const sVisDt = document.getElementById('s_vis_dt')

// selected
const sSelU = document.getElementById('s_sel_u')
const sSelI = document.getElementById('s_sel_i')
const sSelP = document.getElementById('s_sel_p')
const sSelCnt = document.getElementById('s_sel_cnt')
const sSelDt = document.getElementById('s_sel_dt')



// variables
/** The BLE connection. Can be null if not connected. */
let ble = null;

/** "Epoch" shared by the sensor and the program after connection is established. Set after connection is established. */
let epoch = new Date();

let lines = []
let dataRaw = [], data = [];
let startT, stopT, autoExtendInterval, cnt = 0, cntpersec = 0
let thePlot = undefined;


let buff = ""

function init() {
  lines = []
  dataRaw = []
  data = []
  buff = ""
}

let qy1 = [], qy2 = [], qy3 = [], qt = [], lastExtend;
const btnExtend = document.getElementById('btnExtend')
btnExtend.addEventListener('click', extendPlot)

function extendPlot() {
  // only extend if there is data...
  if (qt.length) {
    Plotly.extendTraces(
      graphDiv,
      {
        y: [qy1, qy2, qy3],
        x: [qt, qt, qt]
      },
      [0, 1, 2]
    );
    if (lastExtend) {
      const dataLen = qt.length
      const elapsed = ((new Date()).getTime() - lastExtend.getTime()) / 1000;
      s1.innerText = (dataLen / elapsed).toFixed(2);
    }
    lastExtend = new Date();
    qt.length = 0;
    qy1.length = 0;
    qy2.length = 0;
    qy3.length = 0;
  }
}

function onLine(raw) {

  dataRaw.push(raw)
  let buff = new ArrayBuffer(raw.length)
  let d = new DataView(buff)
  for (let ix = 0; ix < raw.length; ix += 1) {
    d.setUint8(ix, raw.charCodeAt(ix))
  }
  cnt++;
  cntpersec++;
  let timeData = new Uint32Array(buff, 0, 1);
  let time = new Date(epoch.getTime() + timeData[0])
  let floatData = new Float32Array(buff, 4, 3);
  data.push([time, floatData]);

  if (sCnt) {sCnt.innerText = cnt}
  if (sU) {sU.innerText = floatData[0].toFixed(3)}
  if (sI) {sI.innerText = floatData[1].toFixed(3)}
  if (sP) {sP.innerText = floatData[2].toFixed(3)}

  qy1.push(floatData[0])
  qy2.push(floatData[1])
  qy3.push(floatData[2]);
  qt.push(time);
}

function consumeData() {
  while (buff.length > 17) {
    const xIndex = buff.indexOf('x')
    // console.debug('@consume', [buff, buff.length], 'xIndex:', xIndex)
    if (xIndex === -1) {
      // no start character -> clear the buffer
      console.warn('clear', [buff])
      buff = "";
    } else {
      if (buff[xIndex + 17 + 1] === 'y') {
        // got packet
        const packet = buff.substring(xIndex + 1, xIndex + 17)
        // console.debug('packet:', packet, packet.length)
        onLine(packet)

        buff = buff.substring(xIndex + 18)
      } else {
        // no valid packet, throw away some characters
        // If 'x' is at position 0, we have a bad "packet". Can happen if you simultenously connnect to the Espruino...
        buff = buff.substring(xIndex > 0 ? xIndex : 1)
      }
    }
  }
}
/// NEXT:
/// 'epoch' - ok
/// zoom-ra átlag számítás - ok
/// kijelölésre átlag számítás - ok
/// Extend automatizálása
/// Extend-re nem frissül a látható lista
/*
Pan: afterplot (undefined) + relayout - ok
Autoscale: afterplot(undefined) + relayout - ok
Zoom: ok
Autoscale: ok
Reset axes: ok
Extend: afterplot(undefined) + redraw - NOK! Kell a látható tartomány:
*/
/// CSV export?

/**
 *
 * @param {string} d incoming data
 */
function onData(d) {
  buff += d;

  if (buff.length > 17) {
    setTimeout(consumeData)
  }
}


function start() {ble && ble.write("\x10startSend()\n"); lastExtend = new Date(); btnStart.setAttribute('disabled', 'disabled'); btnStop.removeAttribute('disabled');}

function stop() {ble && ble.write("\x10stop()\n"); btnStop.setAttribute('disabled', 'disabled'); if (ble) {btnStart.removeAttribute('disabled');} }


function initPlotly() {

  let plotData = [
    {
      y: [],
      x: [],
      type: 'scattergl',
      mode: "lines",
      line: {color: "#80CAF6"},
      name: LBL_VOLTAGE,
      yaxis: "y2"
    },
    {
      y: [],
      x: [],
      type: 'scattergl',
      mode: "lines",
      line: {color: "#109020"},
      name: LBL_CURRENT
    },
    {
      y: [],
      x: [],
      type: 'scattergl',
      mode: "lines",
      line: {color: "#dedede"},
      name: LBL_POWER
    }
  ];


  let selectorOptions = {
    buttons: [
      {
        step: 'second',
        stepmode: 'backward',
        count: 15,
        label: '15 sec'
      }, {
        step: 'second',
        stepmode: 'todate',
        count: 30,
        label: '30sec'
      }, {
        step: 'minute',
        stepmode: 'backward',
        count: 1,
        label: '1m'
      }, {
        step: 'minute',
        stepmode: 'backward',
        count: 5,
        label: '5m'
      }, {
        step: 'all',
      }]
  };


  let layout = {
    xaxis: {
      rangeselector: selectorOptions,
      // rangeslider: {} // not working with 'scattergl' https://github.com/plotly/plotly.js/issues/2627
    },
    yaxis: {domain: [0, 0.75]},
    yaxis2: {domain: [0.75, 1]},
    height: 610
  };
  const config = {
    modeBarButtonsToRemove: ['lasso'], // disable lasso select, because it's not useful in this useage
    responsive: true,
    toImageButtonOptions: {// make the download image biger
      format: 'svg',
      height: 1080,
      width: 1920
    }
  }
  Plotly.newPlot(graphDiv, plotData, layout, config).then(function(x) {
    thePlot = x;

    graphDiv.on('plotly_relayout', function(eventData) {
      console.log('relayout:', eventData)
      let xRangeLow = eventData['xaxis.range[0]'];
      let xRangeHi = eventData['xaxis.range[1]'];


      let filterStatement = xRangeLow && xRangeHi ? x => x >= xRangeLow && x <= xRangeHi : _x => true;

      if (xRangeHi && xRangeLow) {
        // The ranges are given as strings -> convert the date strings to Date objects
        xRangeLow = new Date(xRangeLow)
        xRangeHi = new Date(xRangeHi)
      }

      // transform the data
      let selectedData = []
      const vGraph = thePlot.data.find(x => x.name === LBL_VOLTAGE)
      const cGraph = thePlot.data.find(x => x.name === LBL_CURRENT)
      const pGraph = thePlot.data.find(x => x.name === LBL_POWER)

      if (!vGraph || !cGraph || !pGraph) {alert('missing graph?'); return;}
      vGraph.x.forEach((x, ix) => {
        if (filterStatement(x)) {
          selectedData.push({time: x, ix: ix, u: vGraph.y[ix], i: cGraph.y[ix], p: pGraph.y[ix]});
        }
      })
      // console.log('selectedData:', selectedData)
      showData(selectedData, sVisU, sVisI, sVisP, sVisCnt, sVisDt)
    })

    /// Zoom out
    /// xaxis.range[0]: "1970-01-01 01:23:37.2773"
    /// xaxis.range[1]: "1970-01-01 01:54:10.8757"
    /// yaxis.range[0]: -126.0571370820468
    /// yaxis.range[1]: 413.3549276093906
    /// yaxis2.range[0]: 4.89867088774673
    /// yaxis2.range[1]: 5.142578864297947

    /// Box range zoom:
    /// xaxis.range[0]: "1970-01-01 01:34:39.8381"
    /// xaxis.range[1]: "1970-01-01 01:36:21.5334"

    /// Autoscale
    /// xaxis.autorange: true
    /// yaxis.autorange: true
    /// yaxis2.autorange: true

    /// Click on pan or zoom or box or lasso select button:
    ///  {dragmode: "pan"} or {dragmode: "zoom"} or {dragmode: "select"} or {dragmode: "lasso"}

    //////// simán új adat jön  -> `afterplot` és `redraw` fut argumentum nélkül!
    graphDiv.on('plotly_redraw', function(eventData) {console.log('redraw:', eventData)})
    // graphDiv.on('plotly_afterplot', function(eventData) {console.log('afterplot:', eventData)})
    // graphDiv.on('plotly_autosize', function(eventData) {console.log('autosize:', eventData)})
    graphDiv.on('plotly_selected', function(eventData) {
      // console.log('selected:', eventData)
      if (thePlot.data[0].x.length === 0) {return;}

      if (eventData && eventData.range && eventData.range.x && eventData.range.x.length === 2) {
        const xRangeLow = new Date(eventData.range.x[0])
        const xRangeHi = new Date(eventData.range.x[1])

        let filterStatement = xRangeLow && xRangeHi ? x => x >= xRangeLow && x <= xRangeHi : _x => true;

        // transform the data
        let selectedData = []
        const vGraph = thePlot.data.find(x => x.name === LBL_VOLTAGE)
        const cGraph = thePlot.data.find(x => x.name === LBL_CURRENT)
        const pGraph = thePlot.data.find(x => x.name === LBL_POWER)

        if (!vGraph || !cGraph || !pGraph) {alert('missing graph?'); return;}
        vGraph.x.forEach((x, ix) => {
          if (filterStatement(x)) {
            selectedData.push({time: x, ix: ix, u: vGraph.y[ix], i: cGraph.y[ix], p: pGraph.y[ix]});
          }
        })
        // console.log('selectedData:', selectedData)
        showData(selectedData, sSelU, sSelI, sSelP, sSelCnt, sSelDt)
      } else {
        console.log('nothing selected')
      }
    });
  });
}

/**
 *
 * @param {[]} selectedData
 * @param {HTMLElement} sVisU
 * @param {HTMLElement} sVisI
 * @param {HTMLElement} sVisP
 * @param {HTMLElement} sVisCnt
 * @param {HTMLElement} sVisDt
 */
function showData(selectedData, sVisU, sVisI, sVisP, sVisCnt, sVisDt) {
  if (selectedData.length) {
    const aggr = selectedData.reduce((acc, curr) => {
      return {
        umin: Math.min(acc.umin, curr.u),
        umax: Math.max(acc.umax, curr.u),
        uavg: acc.uavg + curr.u,
        imin: Math.min(acc.imin, curr.i),
        imax: Math.max(acc.imax, curr.i),
        iavg: acc.iavg + curr.i,
        pmin: Math.min(acc.pmin, curr.p),
        pmax: Math.max(acc.pmax, curr.p),
        pavg: acc.pavg + curr.p,
        tmin: curr.time < acc.tmin ? curr.time : acc.tmin,
        tmax: curr.time > acc.tmax ? curr.time : acc.tmax
      }
    }, {
      umin: selectedData[0].u,
      umax: selectedData[0].u,
      uavg: 0,
      imin: selectedData[0].i,
      imax: selectedData[0].i,
      iavg: 0,
      pmin: selectedData[0].p,
      pmax: selectedData[0].p,
      pavg: 0,
      tmin: selectedData[0].time,
      tmax: selectedData[0].time
    })


    aggr.uavg = aggr.uavg / selectedData.length
    aggr.iavg = aggr.iavg / selectedData.length
    aggr.pavg = aggr.pavg / selectedData.length
    aggr.elapsedms = aggr.tmax - aggr.tmin

    sVisU.innerText = aggr.uavg.toFixed(3)
    sVisI.innerText = aggr.iavg.toFixed(3)
    sVisP.innerText = aggr.pavg.toFixed(3)
    sVisCnt.innerText = selectedData.length
    sVisDt.innerText = aggr.elapsedms
  } else {
    // nothing selected, clear the displays
    sVisU.innerText = "-"
    sVisI.innerText = "-"
    sVisP.innerText = "-"
    sVisCnt.innerText = "-"
    sVisDt.innerText = "-"
  }
}


/// Wire up events
btnStart.addEventListener('click', start)
btnStop.addEventListener('click', stop)
btnClear.addEventListener('click', initPlotly)

chkAutoExtend.addEventListener('change', function() {
  if (autoExtendInterval) {autoExtendInterval = clearInterval(autoExtendInterval)}

  if (chkAutoExtend.checked) {
    autoExtendInterval = setInterval(extendPlot, PLOT_REFRESH_INTERVAL)
  }
})

btnConnect.addEventListener('click', function() {
  if (ble && ble.isOpen) {
    alert('Connection already open!')
    return false;
  }

  if (ble && ble.isOpening) {
    alert('Connection opening!')
    return false;
  }

  btnConnect.setAttribute('disabled', 'disabled')

  Puck.connect(function(conn) {
    if (conn) {
      console.log('conn ok!', conn)
      btnDisconnect.removeAttribute('disabled')
      ble = conn;
      // set time & timezone
      epoch = new Date();
      ble.write(`\x10NRF.setConnectionInterval(7.5); setTime(${(epoch.getTime() / 1000)});E.setTimeZone(${epoch.getTimezoneOffset() / -60}); epoch = new Date(${epoch.getTime()});\n`);
      if (chkAutoExtend.checked) {
        autoExtendInterval = setInterval(extendPlot, PLOT_REFRESH_INTERVAL)
      }

      ble.on("data", onData);
      ble.on('close', function() {ble = null; stop()})
      start()
    } else {
      // alert('BLE connection fail?')
      btnConnect.removeAttribute('disabled')
    }
  })
})

btnDisconnect.addEventListener('click', function() {
  btnDisconnect.setAttribute('disabled', 'disabled')
  if (ble) {ble.close(); ble = null}
  stop()
  extendPlot();
})

// START!
initPlotly()
