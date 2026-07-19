
// Hover projects in navigation
$(document).ready(function() {
  $('.nav').hover(function(){
    if(!$(this).hasClass('active')){
      $(this).addClass('highlight');
    }
  }, function() {
    if(!$(this).hasClass('active')){
      $(this).removeClass('highlight');
    }
  });

// Zoom case study images
  $('.zImg').on('click', function(){
    
    if(!$(this).hasClass('zoomed')){
      console.log('Clicked zImg');
      $(this).addClass('zoomed');
      var bigImg = $(this).attr('src');
      zoomImage(bigImg);
    }else{
      console.log('Clicked Off zImg');
      $(this).removeClass('zoomed');
      //zoomClose;
    }
    function zoomImage(bigImgSrc) {
      // create a new div element
      const newDiv = document.createElement("zDiv");
      // and give it some content
      $('.zDiv').attr("src", bigImgSrc);
      // add the text node to the newly created div
      $('body').append('.zDiv');
      //newDiv.appendChild(newContent);
      // add the newly created element and its content into the DOM
      //const currentDiv = document.getElementById("div1");
      //document.body.insertBefore(newDiv, currentDiv);
    }
  });
  

// Animate nav and load project page on click
  var currentPage = 0;
  $('.nav').on('click', function(){
    console.log("nav clicked");
    //var clickedPage = $(this);
    if(!$(this).hasClass('active')){
      $(this).addClass('click');
      //$(this).addClass('active');
      if($(this).is('#home')){
        $('#home').addClass('active');
        loadPage(0);
      }
      if($(this).is('#proj1')){
        $('#proj1').addClass('active');
        loadPage(1);
      }
      if($(this).is('#proj2')){
        $('#proj2').addClass('active');
        loadPage(2);
      }
      if($(this).is('#proj3')){
        $('#proj3').addClass('active');
        loadPage(3);
      }
      if($(this).is('#motion')){
        $('#motion').addClass('active');
        loadPage(4);
      }
    }
    //project buttons on home page
    if($('#home').hasClass('active')){
      if($(this).is('#proj1_link')){
        $('#home').removeClass('active');
        $('#proj1').addClass('active');
        $('#proj1').addClass('click');
        $('#proj1').addClass('highlight');
        loadPage(1);
      }
      if($(this).is('#proj2_link')){
        $('#home').removeClass('active');
        $('#proj2').addClass('active');
        $('#proj2').addClass('click');
        $('#proj2').addClass('highlight');
        loadPage(2);
      }
      if($(this).is('#proj3_link')){
        $('#home').removeClass('active');
        $('#proj3').addClass('active');
        $('#proj3').addClass('click');
        $('#proj3').addClass('highlight');
        loadPage(3);
      }
      if($(this).is('#motion_link')){
        $('#home').removeClass('active');
        $('#motion').addClass('active');
        $('#motion').addClass('click');
        $('#motion').addClass('highlight');
        loadPage(3);
      }
    }
    function loadPage(pageNumber){
      if(pageNumber == currentPage){
        //do nothing
      } else if(pageNumber == 0){
        clearPage();
        currentPage = 0;
        waypointPage(currentPage);
        $('#p0Content').removeClass('hide');
      } else if(pageNumber == 1){
        clearPage();
        currentPage = 1;
        waypointPage(currentPage);
        $('#p1Content').removeClass('hide');
      } else if(pageNumber == 2){
        clearPage();
        currentPage = 2;
        waypointPage(currentPage);
        $('#p2Content').removeClass('hide');
      } else if(pageNumber == 3){
        clearPage();
        currentPage = 3;
        waypointPage(currentPage);
        $('#p3Content').removeClass('hide');
      } else if(pageNumber == 4){
        clearPage();
        currentPage = 4;
        waypointPage(currentPage);
        $('#motionContent').removeClass('hide');
      }
      function clearPage(){
        $(window).scrollTop(0);
        Waypoint.destroyAll(); //console.log('Destroy all waypoints');
        if(currentPage == 0){
          $('#p0Content').addClass('hide');
          $('#home').removeClass('highlight');
          $('#home').removeClass('click');
          $('#home').removeClass('active');
        }
        if(currentPage == 1){
          $('#p1Content').addClass('hide');
          $('#proj1').removeClass('highlight');
          $('#proj1').removeClass('click');
          $('#proj1').removeClass('active');
        }
        if(currentPage == 2){
          $('#p2Content').addClass('hide');
          $('#proj2').removeClass('highlight');
          $('#proj2').removeClass('click');
          $('#proj2').removeClass('active');
        }
        if(currentPage == 3){
          $('#p3Content').addClass('hide');
          $('#proj3').removeClass('highlight');
          $('#proj3').removeClass('click');
          $('#proj3').removeClass('active');
        }
        if(currentPage == 4){
          $('#motionContent').addClass('hide');
          $('#motion').removeClass('highlight');
          $('#motion').removeClass('click');
          $('#motion').removeClass('active');
        }
      }
    }
  })
});

// about me expand
$(document).ready(function() {
  var $content = $('#aboutMeMore');
  console.debug('AboutMe init #aboutMeMore found:', $content.length);

  $content
    .css('display','flex')
    .hide();

  $('#aboutMeToggle').on('click', function () {
    var $btn = $(this);

    if ($content.is(':visible')) {
      $content.slideUp(300, function () {
        $btn.text('Read More');
      });
    } else {
      $content.slideDown(300, function () {
        $btn.text('Read Less');
      });
    }
  });
});

/*
// Sidebar scroller
$(document).ready(function() {
  $(window).scroll(function(event){
    //console.log($(window).scrollTop()); //use for ratio
    var scrollPos = ($(window).scrollTop() / 9);
    if(scrollPos < 400){
      $('#mainDot1').css('top', scrollPos);
      $('#mainDot2').css('top', scrollPos);
      $('#mainDot3').css('top', scrollPos);
    } else {
      $('#mainDot1').css('top', 410);
      $('#mainDot2').css('top', 410);
      $('#mainDot3').css('top', 410);
    }
    
    //console.log($('#mainDot').top);
  });
});
*/

/*
// Draggable jQuery-UI
$(document).ready(function() {
  $(function() { 
    $('#mainDot1').draggable({
      containment: '#dotContain1',
    });
  });
  $("#mainDot1").on("drag", function(event, ui) {
    var thisChanges = (ui.position.top * 9);
    $(window).scrollTop(thisChanges)
    //console.log(ui);
  } );

  $(function() { 
    $('#mainDot2').draggable({
      containment: '#dotContain2',
    });
  });
  $("#mainDot2").on("drag", function(event, ui) {
    var thisChanges = (ui.position.top * 9);
    $(window).scrollTop(thisChanges)
    //console.log(ui);
  } );

  $(function() { 
    $('#mainDot3').draggable({
      containment: '#dotContain3',
    });
  });
  $("#mainDot3").on("drag", function(event, ui) {
    var thisChanges = (ui.position.top * 9);
    $(window).scrollTop(thisChanges)
    //console.log(ui);
  } );
});
*/

// Sidebar collapse on scroll
// Waypoint Library jQuery
// http://imakewebthings.com/waypoints/guides/jquery-zepto/


function waypointPage(pageNumber) {
  console.log('Waypoint page #: ' + pageNumber);
  var thisSection = $('#p' + pageNumber + 'Content');
  
  $(document).ready(function() {
    // Section 0
    var $el0 = $('#p' + pageNumber + 's0');
    if ($el0.length) {
      new Waypoint({
        element: $el0[0],
        handler: function() {
          console.log('No Waypoints Yet');
          $('.dots1, .dots2, .dots3, .dots4, .dots5, .dots6').removeClass('hide');
        }
      });
    }

    // Section 1
    var $el1 = $('#p' + pageNumber + 's1');
    if ($el1.length) {
      new Waypoint({
        element: $el1[0],
        handler: function() {
          console.log('Waypoint 1');
          $('.dots1').toggleClass('hide');
          $('.btn1').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }

    // Section 2
    var $el2 = $('#p' + pageNumber + 's2');
    if ($el2.length) {
      new Waypoint({
        element: $el2[0],
        handler: function() {
          console.log('Waypoint 2');
          $('.dots2').toggleClass('hide');
          $('.btn2').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }

    // Section 3
    var $el3 = $('#p' + pageNumber + 's3');
    if ($el3.length) {
      new Waypoint({
        element: $el3[0],
        handler: function() {
          console.log('Waypoint 3');
          $('.dots3').toggleClass('hide');
          $('.btn3').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }

    // Section 4
    var $el4 = $('#p' + pageNumber + 's4');
    if ($el4.length) {
      new Waypoint({
        element: $el4[0],
        handler: function() {
          console.log('Waypoint 4');
          $('.dots4').toggleClass('hide');
          $('.btn4').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }

    // Section 5
    var $el5 = $('#p' + pageNumber + 's5');
    if ($el5.length) {
      new Waypoint({
        element: $el5[0],
        handler: function() {
          console.log('Waypoint 5');
          $('.dots5').toggleClass('hide');
          $('.btn5').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }

    // Section 6
    var $el6 = $('#p' + pageNumber + 's6');
    if ($el6.length) {
      new Waypoint({
        element: $el6[0],
        handler: function() {
          console.log('Waypoint 6');
          $('.dots6').toggleClass('hide');
          $('.btn6').toggleClass('navFocus');
        },
        offset: 'bottom-in-view'
      });
    }
  });

};


/*
// Sidebar buttons
$(document).ready(function() {
  $(".btn0").click(function() {
    $("html").animate({
        scrollTop: $("#p1s0").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn1").click(function() {
    $("html").animate({
        scrollTop: $("#p1s1").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn2").click(function() {
    $("html").animate({
        scrollTop: $("#p1s2").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn3").click(function() {
    $("html").animate({
        scrollTop: $("#p1s3").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn4").click(function() {
    $("html").animate({
        scrollTop: $("#p1s4").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn5").click(function() {
    console.log("Click to Section 2");
    $("html").animate({
        scrollTop: $("#p1s5").offset().top -220
      }, 800 //speed
    );
  });
  $(".btn6").click(function() {
    console.log("Click to Section 2");
    $("html").animate({
        scrollTop: $("#p1s6").offset().top -220
      }, 800 //speed
    );
  });
});
*/

// Hero animation
$(document).ready(function() {   
    function animateCloud1() {
        $('#cloud1').animate({
            'right':'-200px'
        }
            ,52000, 'linear'
        )
        .animate(
            {'right':'1600px'}
            ,1
            ,animateCloud1
        ); 
    }
    animateCloud1();
}); 
$(document).ready(function() {   
    function animateCloud2() {
        $('#cloud2').animate({
            'left':'1400px'
        }
            ,25000, 'linear'
        )
        .animate(
            {'left':'100px'}
            ,1, 'linear'
            ,animateCloud2
        ); 
    }
    animateCloud2();
}); 

