import fetch from 'isomorphic-fetch';
import qs from 'qs';

export function getCookie(name) {
  let arr = [];
  const reg = new RegExp('(^| )' + name + '=([^;]*)(;|$)');
  if (document.cookie.match(reg)) {
    arr = document.cookie.match(reg);
    return unescape(arr[2]);
  } else {
    return null;
  }
}

const messages = {
  '403Code': '返回码 403',
  '403Message': '无接口访问权限，请咨询管理员。',
};

const check401 = res => {
  return res; // 暂时始终返回 res
};

const check403 = res => {
  // 配合权限SDK的403跳转
  res
    .json()
    .then(jsonResult => {
      if (jsonResult.code === '302' && jsonResult.location !== undefined) {
        window.location.href = jsonResult.location;
      }
    })
    .catch(() => {
      console.log(messages['403Code'], messages['403Message'])
    });
  return res;
};

const check200 = (res, newUrl = '', configs) => {
  if (res.ok) {
    return res.json().then(result => {
      const messageContent = configs.messageParse(result);
      const displayControl = configs.displayControl;
      // 解析出业务 success
      if (result.success) {
        if (configs.successMsg) {
          console.log(configs.successMsg);
        }
      } else {
        const url = window.location.href.toString();
        if (result.errorCode === '401') {
          if (url.indexOf('/login') < 0) {
            // router.push(`/login?goto=${encodeURIComponent(url)}`);
          }
          return res; // 暂时始终返回 res
        }

        if (newUrl.indexOf('currentUserInfo') > 0) {
          return result;
        }

        switch (displayControl.type) {
          case 'message':
            console.error(messageContent.message, displayControl.duration);
            break;
          default:
            console.error({
              message: '出错了',
              description: messageContent.message,
            });
            break;
        }
      }
      return result;
    });
  }
};

const errorMessages = res => {
  return `${res.status} ${res.statusText}`;
};

const check404or50x = res => {
  return new Promise((_, reject) => {
    reject(errorMessages(res));
    return;
  });
};

const checkOtherCode = res => {
  return new Promise((_, reject) => {
    let err;
    try {
      res.json().then(jsonResult => {
        err =
          (jsonResult.reasons && jsonResult.reasons[0] && jsonResult.reasons[0].content) ||
          errorMessages(res);
        reject(err);
        console.error(err);
      });
    } catch (e) {
      err = errorMessages(res);
      reject(err);
    }
  });
};

const beforeSend = newOptions => {
  if (newOptions.method === 'POST' || newOptions.method === 'PUT') {
    newOptions.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...newOptions.headers,
    };
    const contentType = newOptions.headers['Content-Type'];

    if (contentType.indexOf('form-urlencoded') >= 0) {
      newOptions.body = qs.stringify(newOptions.data || {});
      // 如果 Content-Type 是json 的话，自动处理下 stringify
    } else if (contentType.indexOf('json') >= 0) {
      newOptions.body = JSON.stringify(newOptions.data || {});
    } else if (contentType.indexOf('form-data') >= 0) {
      // 如果不是 json，则删除 Content-Type ,让 浏览器自动添加，
      // 不然 form-data 的 boundary 设置不上
      // see more: https://stackoverflow.com/questions/39280438/fetch-missing-boundary-in-multipart-form-data-post
      delete newOptions.headers['Content-Type'];
    }
  }
  return newOptions;
};

/**
 * url 添加 ctoken
 * @param {string} url
 */
const addUrlCtoken = url => {
  let realURL = url;
  const ctoken = getCookie('ctoken');
  if (ctoken) {
    const str = url.indexOf('?') > -1 ? '&' : '?';
    realURL = `${url}${str}ctoken=${encodeURIComponent(ctoken)}`;
  }
  return realURL;
};

const commonFetch = (newUrl, newOptions, newConfigs) => {
  return fetch(newUrl, newOptions).then(res => {
    if (res.status === 401) {
      // 401 未登录
      return check401(res);
    } else if (res.status === 403) {
      // 403 无权限
      return check403(res);
    } else if (res.status === 404 || res.status >= 500) {
      return check404or50x(res);
    } else if (res.status === 200) {
      return check200(res, newUrl, newConfigs);
    } else {
      // 其他请求码
      return checkOtherCode(res);
    }
  });
};

export interface IOptions {
  method: string;
  headers?: any;
  params?: any;
  body?: any;
  data?: any;
}
const request = (url, options?: IOptions, configs = {}) => {
  let newOptions = {
    method: 'GET',
    credentials: 'same-origin',
    ...options,
    headers: options.headers || { Accept: 'application/json' },
    data: options.body || options.params || options.data,
  };

  const newConfigs = {
    ctoken: true,
    messageParse: resJson => {
      return {
        success: typeof resJson.success !== 'undefined' ? resJson.success : true,
        message: resJson.errorMsg || '',
      };
    },
    displayControl: {
      type: 'modal',
      duration: 3,
    },
    ...configs,
  };

  newOptions = beforeSend(newOptions);

  let newUrl = url;
  if ((newOptions.method === 'GET' || newOptions.method === 'DELETE') && options) {
    newUrl += `?${qs.stringify(options.data)}`;
  }

  if (newConfigs.ctoken) {
    newUrl = addUrlCtoken(newUrl);
  }

  return commonFetch(newUrl, newOptions, newConfigs);
};

export default request;
