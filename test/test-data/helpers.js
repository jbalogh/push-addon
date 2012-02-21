var T = (function() {

var pass = 0,
    fail = 0,
    timeout = 0,
    waiting = false;

function assert(t) {
  if (!!t) {
    pass++;
  } else {
    fail++;
    console.trace();
  }
}

function done() {
  if (waiting) return;

  document.body.setAttribute('pass', pass);
  document.body.setAttribute('fail', fail);
  document.body.setAttribute('timeout', timeout);

  var e = document.createEvent('Event');
  e.initEvent('testDone', true, true);
  document.dispatchEvent(e);
}

function wait(timeout) {
  waiting = setTimeout(function() {
    waiting = false;
    timeout++;
    done();
  }, timeout || 10000);
}

function stopWaiting() {
  clearTimeout(waiting);
  done();
}

function tests(fun) {
  document.addEventListener('DOMContentLoaded', function() {
    fun();
    done();
  });
}

return {
  'tests': tests,
  'assert': assert,
  'wait': wait,
  'stopWaiting': stopWaiting
};
})();
