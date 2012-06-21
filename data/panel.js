var notifications = [];

self.port.on('message:init', function(messages) {
  notifications = messages;
  render();
});

self.port.on('message', function(message) {
  notifications.push(message);
  render();
});

self.port.on('delete', function(index) {
  notifications.splice(index, 1);
  render();
});

document.addEventListener('click', function(e) {
  for (var el = e.target; el.parentNode; el = el.parentNode) {
    if (el.tagName.toLowerCase() == 'a') {
      e.preventDefault();
      self.port.emit('click', el.getAttribute('href'),
                     /* Middle click triggers background tab. */
                     e.button == 1);
      if (el.hasAttribute('data-index')) {
        self.port.emit('delete', el.getAttribute('data-index'));
      }
      return;
    } else if (el.classList.contains('del')) {
      e.preventDefault();
      self.port.emit('delete', el.parentNode.parentNode.getAttribute('data-index'));
      return;
    } else if (el.classList.contains('header-link')) {
      document.body.classList.toggle('flipped');
    } else if (el.parentNode.id == 'tabs') {
      selectTab(el);
    } else if (el.id == 'trash') {
      clearAll();
    }
  }
});

function $(s) {
  return document.getElementById(s);
}

function $$(s) {
  return Array.prototype.slice.call(document.querySelectorAll(s));
}

function clearAll() {
  self.port.emit('clear-all');
  notifications = [];
  render();
}

function selectTab(el) {
  $$('#tabs .selected, .tab.selected').forEach(function(e) {
    e.classList.toggle('selected');
  });
  el.classList.add('selected');
  $(el.getAttribute('data-target')).classList.add('selected');
}

function render() {
  var list = $('notifications'),
      template = $('notifications-template').textContent,
      view = {sites: []};

  notifications.sort(function(a, b) {
    if (a.time < b.time) return 1;
    if (a.time > b.time) return -1;
    return 0;
  });

  // Clean up the time element.
  notifications.forEach(function(e, index) {
    e.prettyTime = prettyDate(e.time);
    e.index = index;
  });

  // notifications.groupBy('site')
  groups = {};
  notifications.forEach(function(e) {
    var key = e.site;
    (groups[key] || (groups[key] = [])).push(e);
  });


  for (var domain in groups) {
    var site = {domain: domain == 'Welcome' ? 'mozilla.org' : domain,
                name: domain,
                icon: icons[domain] || icons["default"]};
    site.notifications = groups[domain];
    view.sites.push(site);
  }

  list.innerHTML = Mustache.render(template, view);
  renderSettings();
}

function renderSettings() {
  var list = $('site-settings'),
      template = $('site-settings-template').textContent,
      view = {sites: []},
      sites = {};

  notifications.forEach(function(e) {
    var domain = e.site;
    if (!(domain in sites)) {
      view.sites.push({domain: domain,
                       icon: icons[domain] || icons["default"],
                       latest: e.prettyTime});
      sites[domain] = true;

    }
  });

  list.innerHTML = Mustache.render(template, view);
}

var icons = {
  "Welcome": "http://z.jbalogh.me/heart.png",
  "github.jbalogh.me": "https://github.com/favicon.ico",
  "github-notifications.herokuapp.com": "https://github.com/favicon.ico",
  "default": "http://z.jbalogh.me/signal.png",
  "facebook.com": "http://a3.mzstatic.com/us/r1000/086/Purple/03/df/55/mzl.ziwhldlf.175x175-75.jpg",
  "foursquare.com": "https://static-s.foursquare.com/img/touch-icon-ipad-1d5a99e90171f6a0cc2f74920ec24021.png",
  "twitter.com": "https://si0.twimg.com/twitter-mobile/d23caade6d08e27a428c5e60a1b67371ccaf4569/images/apple-touch-icon-114.png",
  "nytimes.com": "http://graphics8.nytimes.com/webapps/skimmer/2.4/images/skmr_256.png",
  "tumblr.com": "http://assets.tumblr.com/images/apple_touch_icon.png"
};
