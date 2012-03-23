var notifications = [];

self.port.on('message:init', function(messages) {
  notifications = messages;
  render();
});

self.port.on('message', function(message) {
  notifications.push(message);
  render();
});

document.addEventListener('click', function(e) {
  for (var el = e.target; el.parentNode; el = el.parentNode) {
    if (el.tagName.toLowerCase() == 'a') {
      e.preventDefault();
      self.port.emit('click', el.getAttribute('href'),
                     /* Middle click triggers background tab. */
                     e.button == 1);
    }
  }
});


function render() {
  var list = document.getElementById('notifications'),
      template = document.getElementById('template').textContent,
      view = {sites: []};

  notifications.sort(function(a, b) {
    if (a.time < b.time) return 1;
    if (a.time > b.time) return -1;
    return 0;
  });

  // Clean up the time element.
  notifications.forEach(function(e) {
    e.prettyTime = prettyDate(e.time);
  });

  // notifications.groupBy('site')
  groups = {};
  notifications.forEach(function(e) {
    var key = e.site;
    (groups[key] || (groups[key] = [])).push(e);
  });


  for (var domain in groups) {
    var site = {domain: domain,
                name: domain,
                icon: icons[domain] || icons["default"]};
    site.notifications = groups[domain];
    view.sites.push(site);
  }

  list.innerHTML = Mustache.render(template, view);
  // I don't know why I need 12 extra pixels.
  self.port.emit('height', document.body.offsetHeight + 12);
}

var icons = {
  "default": "http://f.cl.ly/items/0N080k1R040w1U2L223s/signal.png",
  "facebook.com": "http://a3.mzstatic.com/us/r1000/086/Purple/03/df/55/mzl.ziwhldlf.175x175-75.jpg",
  "foursquare.com": "https://static-s.foursquare.com/img/touch-icon-ipad-1d5a99e90171f6a0cc2f74920ec24021.png",
  "twitter.com": "https://si0.twimg.com/twitter-mobile/d23caade6d08e27a428c5e60a1b67371ccaf4569/images/apple-touch-icon-114.png",
  "nytimes.com": "http://graphics8.nytimes.com/webapps/skimmer/2.4/images/skmr_256.png",
  "tumblr.com": "http://assets.tumblr.com/images/apple_touch_icon.png"
};
