(function () {
  /**
   * Icarus 夜間模式 by iMaeGoo
   * https://www.imaegoo.com/
   */

  var isNight = localStorage.getItem('night');
  var nightNav;

  function applyNight(value) {
    if (value.toString() === 'true') {
      document.body.classList.remove('light');
      document.body.classList.add('night');
    } else {
      document.body.classList.remove('night');
      document.body.classList.add('light');
    }
  }

  function createNightButton() {
    // 找到導航欄的結束位置
    var navbarEnd = document.querySelector('.navbar-end');
    if (!navbarEnd) {
      // 如果沒有 navbar-end，找到 navbar-menu
      var navbarMenu = document.querySelector('.navbar-menu');
      if (navbarMenu) {
        navbarEnd = document.createElement('div');
        navbarEnd.className = 'navbar-end';
        navbarMenu.appendChild(navbarEnd);
      }
    }
    
    if (navbarEnd) {
      // 創建夜間模式切換按鈕
      var nightButton = document.createElement('a');
      nightButton.className = 'navbar-item night';
      nightButton.id = 'night-nav';
      nightButton.title = 'Night Mode';
      nightButton.href = 'javascript:;';
      
      var icon = document.createElement('i');
      icon.className = 'fas fa-lightbulb';
      icon.id = 'night-icon';
      
      nightButton.appendChild(icon);
      navbarEnd.appendChild(nightButton);
      
      return nightButton;
    }
    return null;
  }

  function findNightNav() {
    nightNav = document.getElementById('night-nav');
    if (!nightNav) {
      // 嘗試創建按鈕
      nightNav = createNightButton();
      if (!nightNav) {
        setTimeout(findNightNav, 100);
        return;
      }
    }
    nightNav.addEventListener('click', switchNight);
  }

  function switchNight() {
    isNight = isNight ? isNight.toString() !== 'true' : true;
    applyNight(isNight);
    localStorage.setItem('night', isNight);
  }

  // 等待 DOM 加載完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(findNightNav, 500);
    });
  } else {
    setTimeout(findNightNav, 500);
  }
  
  // 立即應用夜間模式設置
  isNight && applyNight(isNight);
}()); 