//jQuery does not have keyframes built in
$.keyframe.define([{
    name:'orbitPos',
    '0%': {
      'margin-left':'0px'
    },
    '50%': {
      'margin-left':'600px'
    },
    '100%': {
      'margin-left':'0px'
    }
  }, {
    name:'orbitScale',
    from: {
      'transform':'rotate(90deg)'
    },
    to: {
      'transform':'rotate(450deg)'
    }
  }]);
  $('#orbit').playKeyframe({
    name:'orbitPos',
    duration:"3s",
    timingFunction:'ease',
    iterationCount:'infinite',
    direction:'normal',
    fillMode:'forwards',
    complete: increment
  });
  