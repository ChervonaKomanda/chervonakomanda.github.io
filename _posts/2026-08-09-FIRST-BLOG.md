---
layout: post
title:  "The first post ever"
author: "Chervona"
tags: [wow, omg, jekyll]
excerpt_separator: <!--more-->
---

# **Hello world**, this is my first blog post.
<!--more-->

I hope you like it! Wow this is so wild.
Omg no way.

{% for tag in site.tags %}
  <h3>{{ tag[0] }}</h3>
  <ul>
    {% for post in tag[1] %}
      <li><a href="{{ post.url }}">{{ post.title }}</a></li>
    {% endfor %}
  </ul>
{% endfor %}
