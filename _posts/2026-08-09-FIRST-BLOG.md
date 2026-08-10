---
layout: post
title:  "The first post ever"
author: "Chervona"
---

**Hello world**, this is my first blog post.

---
excerpt_separator: <!--more-->
---

I hope you like it!

{% for tag in site.tags %}
  <h3>{{ tag[0] }}</h3>
  <ul>
    {% for post in tag[1] %}
      <li><a href="{{ post.url }}">{{ post.title }}</a></li>
    {% endfor %}
  </ul>
{% endfor %}
