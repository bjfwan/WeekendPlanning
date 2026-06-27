/** 中国城市数据（含拼音与拼音首字母，用于自动完成匹配） */
export interface City {
  /** 城市名，如 "杭州" */
  name: string
  /** 全拼（小写），如 "hangzhou" */
  pinyin: string
  /** 拼音首字母（小写），如 "hz" */
  pinyinShort: string
  /** 所属省份（简称），如 "浙江" */
  province: string
}

export const CHINA_CITIES: City[] = [
  // 直辖市
  { name: '北京', pinyin: 'beijing', pinyinShort: 'bj', province: '北京' },
  { name: '上海', pinyin: 'shanghai', pinyinShort: 'sh', province: '上海' },
  { name: '天津', pinyin: 'tianjin', pinyinShort: 'tj', province: '天津' },
  { name: '重庆', pinyin: 'chongqing', pinyinShort: 'cq', province: '重庆' },

  // 浙江省
  { name: '杭州', pinyin: 'hangzhou', pinyinShort: 'hz', province: '浙江' },
  { name: '宁波', pinyin: 'ningbo', pinyinShort: 'nb', province: '浙江' },
  { name: '温州', pinyin: 'wenzhou', pinyinShort: 'wz', province: '浙江' },
  { name: '绍兴', pinyin: 'shaoxing', pinyinShort: 'sx', province: '浙江' },
  { name: '嘉兴', pinyin: 'jiaxing', pinyinShort: 'jx', province: '浙江' },
  { name: '金华', pinyin: 'jinhua', pinyinShort: 'jh', province: '浙江' },
  { name: '舟山', pinyin: 'zhoushan', pinyinShort: 'zs', province: '浙江' },
  { name: '湖州', pinyin: 'huzhou', pinyinShort: 'hz', province: '浙江' },
  { name: '台州', pinyin: 'taizhou', pinyinShort: 'tz', province: '浙江' },
  { name: '丽水', pinyin: 'lishui', pinyinShort: 'ls', province: '浙江' },
  { name: '衢州', pinyin: 'quzhou', pinyinShort: 'qz', province: '浙江' },

  // 江苏省
  { name: '南京', pinyin: 'nanjing', pinyinShort: 'nj', province: '江苏' },
  { name: '苏州', pinyin: 'suzhou', pinyinShort: 'sz', province: '江苏' },
  { name: '无锡', pinyin: 'wuxi', pinyinShort: 'wx', province: '江苏' },
  { name: '常州', pinyin: 'changzhou', pinyinShort: 'cz', province: '江苏' },
  { name: '徐州', pinyin: 'xuzhou', pinyinShort: 'xz', province: '江苏' },
  { name: '扬州', pinyin: 'yangzhou', pinyinShort: 'yz', province: '江苏' },
  { name: '南通', pinyin: 'nantong', pinyinShort: 'nt', province: '江苏' },
  { name: '连云港', pinyin: 'lianyungang', pinyinShort: 'lyg', province: '江苏' },
  { name: '盐城', pinyin: 'yancheng', pinyinShort: 'yc', province: '江苏' },
  { name: '镇江', pinyin: 'zhenjiang', pinyinShort: 'zj', province: '江苏' },
  { name: '泰州', pinyin: 'taizhou', pinyinShort: 'tz', province: '江苏' },

  // 广东省
  { name: '广州', pinyin: 'guangzhou', pinyinShort: 'gz', province: '广东' },
  { name: '深圳', pinyin: 'shenzhen', pinyinShort: 'sz', province: '广东' },
  { name: '珠海', pinyin: 'zhuhai', pinyinShort: 'zh', province: '广东' },
  { name: '佛山', pinyin: 'foshan', pinyinShort: 'fs', province: '广东' },
  { name: '东莞', pinyin: 'dongguan', pinyinShort: 'dg', province: '广东' },
  { name: '中山', pinyin: 'zhongshan', pinyinShort: 'zs', province: '广东' },
  { name: '汕头', pinyin: 'shantou', pinyinShort: 'st', province: '广东' },
  { name: '湛江', pinyin: 'zhanjiang', pinyinShort: 'zj', province: '广东' },
  { name: '惠州', pinyin: 'huizhou', pinyinShort: 'hz', province: '广东' },

  // 四川省
  { name: '成都', pinyin: 'chengdu', pinyinShort: 'cd', province: '四川' },
  { name: '九寨沟', pinyin: 'jiuzhaigou', pinyinShort: 'jzg', province: '四川' },
  { name: '乐山', pinyin: 'leshan', pinyinShort: 'ls', province: '四川' },
  { name: '峨眉山', pinyin: 'emeishan', pinyinShort: 'ems', province: '四川' },
  { name: '都江堰', pinyin: 'dujiangyan', pinyinShort: 'djy', province: '四川' },

  // 云南省
  { name: '昆明', pinyin: 'kunming', pinyinShort: 'km', province: '云南' },
  { name: '大理', pinyin: 'dali', pinyinShort: 'dl', province: '云南' },
  { name: '丽江', pinyin: 'lijiang', pinyinShort: 'lj', province: '云南' },
  { name: '香格里拉', pinyin: 'xianggelila', pinyinShort: 'xgll', province: '云南' },
  { name: '西双版纳', pinyin: 'xishuangbanna', pinyinShort: 'xsbn', province: '云南' },
  { name: '普洱', pinyin: 'puer', pinyinShort: 'pe', province: '云南' },

  // 海南省
  { name: '海口', pinyin: 'haikou', pinyinShort: 'hk', province: '海南' },
  { name: '三亚', pinyin: 'sanya', pinyinShort: 'sy', province: '海南' },
  { name: '儋州', pinyin: 'danzhou', pinyinShort: 'dz', province: '海南' },

  // 福建省
  { name: '福州', pinyin: 'fuzhou', pinyinShort: 'fz', province: '福建' },
  { name: '厦门', pinyin: 'xiamen', pinyinShort: 'xm', province: '福建' },
  { name: '泉州', pinyin: 'quanzhou', pinyinShort: 'qz', province: '福建' },
  { name: '漳州', pinyin: 'zhangzhou', pinyinShort: 'zz', province: '福建' },
  { name: '武夷山', pinyin: 'wuyishan', pinyinShort: 'wys', province: '福建' },

  // 山东省
  { name: '济南', pinyin: 'jinan', pinyinShort: 'jn', province: '山东' },
  { name: '青岛', pinyin: 'qingdao', pinyinShort: 'qd', province: '山东' },
  { name: '烟台', pinyin: 'yantai', pinyinShort: 'yt', province: '山东' },
  { name: '威海', pinyin: 'weihai', pinyinShort: 'wh', province: '山东' },
  { name: '潍坊', pinyin: 'weifang', pinyinShort: 'wf', province: '山东' },
  { name: '日照', pinyin: 'rizhao', pinyinShort: 'rz', province: '山东' },
  { name: '泰安', pinyin: 'taian', pinyinShort: 'ta', province: '山东' },

  // 湖南省
  { name: '长沙', pinyin: 'changsha', pinyinShort: 'cs', province: '湖南' },
  { name: '张家界', pinyin: 'zhangjiajie', pinyinShort: 'zjj', province: '湖南' },
  { name: '岳阳', pinyin: 'yueyang', pinyinShort: 'yy', province: '湖南' },
  { name: '凤凰', pinyin: 'fenghuang', pinyinShort: 'fh', province: '湖南' },

  // 湖北省
  { name: '武汉', pinyin: 'wuhan', pinyinShort: 'wh', province: '湖北' },
  { name: '宜昌', pinyin: 'yichang', pinyinShort: 'yc', province: '湖北' },
  { name: '神农架', pinyin: 'shennongjia', pinyinShort: 'snj', province: '湖北' },

  // 陕西省
  { name: '西安', pinyin: 'xian', pinyinShort: 'xa', province: '陕西' },
  { name: '咸阳', pinyin: 'xianyang', pinyinShort: 'xy', province: '陕西' },
  { name: '延安', pinyin: 'yanan', pinyinShort: 'ya', province: '陕西' },
  { name: '汉中', pinyin: 'hanzhong', pinyinShort: 'hz', province: '陕西' },

  // 河南省
  { name: '郑州', pinyin: 'zhengzhou', pinyinShort: 'zz', province: '河南' },
  { name: '洛阳', pinyin: 'luoyang', pinyinShort: 'ly', province: '河南' },
  { name: '开封', pinyin: 'kaifeng', pinyinShort: 'kf', province: '河南' },
  { name: '安阳', pinyin: 'anyang', pinyinShort: 'ay', province: '河南' },

  // 安徽省
  { name: '合肥', pinyin: 'hefei', pinyinShort: 'hf', province: '安徽' },
  { name: '黄山', pinyin: 'huangshan', pinyinShort: 'hs', province: '安徽' },
  { name: '芜湖', pinyin: 'wuhu', pinyinShort: 'wh', province: '安徽' },
  { name: '安庆', pinyin: 'anqing', pinyinShort: 'aq', province: '安徽' },

  // 江西省
  { name: '南昌', pinyin: 'nanchang', pinyinShort: 'nc', province: '江西' },
  { name: '九江', pinyin: 'jiujiang', pinyinShort: 'jj', province: '江西' },
  { name: '景德镇', pinyin: 'jingdezhen', pinyinShort: 'jdz', province: '江西' },
  { name: '庐山', pinyin: 'lushan', pinyinShort: 'ls', province: '江西' },

  // 广西壮族自治区
  { name: '南宁', pinyin: 'nanning', pinyinShort: 'nn', province: '广西' },
  { name: '桂林', pinyin: 'guilin', pinyinShort: 'gl', province: '广西' },
  { name: '北海', pinyin: 'beihai', pinyinShort: 'bh', province: '广西' },
  { name: '阳朔', pinyin: 'yangshuo', pinyinShort: 'ys', province: '广西' },

  // 贵州省
  { name: '贵阳', pinyin: 'guiyang', pinyinShort: 'gy', province: '贵州' },
  { name: '遵义', pinyin: 'zunyi', pinyinShort: 'zy', province: '贵州' },
  { name: '凯里', pinyin: 'kaili', pinyinShort: 'kl', province: '贵州' },
  { name: '铜仁', pinyin: 'tongren', pinyinShort: 'tr', province: '贵州' },

  // 辽宁省
  { name: '沈阳', pinyin: 'shenyang', pinyinShort: 'sy', province: '辽宁' },
  { name: '大连', pinyin: 'dalian', pinyinShort: 'dl', province: '辽宁' },
  { name: '鞍山', pinyin: 'anshan', pinyinShort: 'as', province: '辽宁' },
  { name: '丹东', pinyin: 'dandong', pinyinShort: 'dd', province: '辽宁' },

  // 吉林省
  { name: '长春', pinyin: 'changchun', pinyinShort: 'cc', province: '吉林' },
  { name: '吉林', pinyin: 'jilin', pinyinShort: 'jl', province: '吉林' },
  { name: '延吉', pinyin: 'yanji', pinyinShort: 'yj', province: '吉林' },
  { name: '长白山', pinyin: 'changbaishan', pinyinShort: 'cbs', province: '吉林' },

  // 黑龙江省
  { name: '哈尔滨', pinyin: 'haerbin', pinyinShort: 'heb', province: '黑龙江' },
  { name: '齐齐哈尔', pinyin: 'qiqihaer', pinyinShort: 'qqhe', province: '黑龙江' },
  { name: '牡丹江', pinyin: 'mudanjiang', pinyinShort: 'mdj', province: '黑龙江' },
  { name: '漠河', pinyin: 'mohe', pinyinShort: 'mh', province: '黑龙江' },

  // 山西省
  { name: '太原', pinyin: 'taiyuan', pinyinShort: 'ty', province: '山西' },
  { name: '大同', pinyin: 'datong', pinyinShort: 'dt', province: '山西' },
  { name: '平遥', pinyin: 'pingyao', pinyinShort: 'py', province: '山西' },

  // 河北省
  { name: '石家庄', pinyin: 'shijiazhuang', pinyinShort: 'sjz', province: '河北' },
  { name: '承德', pinyin: 'chengde', pinyinShort: 'cd', province: '河北' },
  { name: '秦皇岛', pinyin: 'qinhuangdao', pinyinShort: 'qhd', province: '河北' },
  { name: '保定', pinyin: 'baoding', pinyinShort: 'bd', province: '河北' },

  // 内蒙古自治区
  { name: '呼和浩特', pinyin: 'huhehaote', pinyinShort: 'hhht', province: '内蒙古' },
  { name: '包头', pinyin: 'baotou', pinyinShort: 'bt', province: '内蒙古' },
  { name: '鄂尔多斯', pinyin: 'eerduosi', pinyinShort: 'eds', province: '内蒙古' },
  { name: '呼伦贝尔', pinyin: 'hulunbeier', pinyinShort: 'hlbe', province: '内蒙古' },
  { name: '杭锦后旗', pinyin: 'hangjinhouqi', pinyinShort: 'hjhq', province: '内蒙古' },
  { name: '杭锦旗', pinyin: 'hangjinqi', pinyinShort: 'hjq', province: '内蒙古' },

  // 甘肃省
  { name: '兰州', pinyin: 'lanzhou', pinyinShort: 'lz', province: '甘肃' },
  { name: '敦煌', pinyin: 'dunhuang', pinyinShort: 'dh', province: '甘肃' },
  { name: '嘉峪关', pinyin: 'jiayuguan', pinyinShort: 'jyg', province: '甘肃' },

  // 青海省
  { name: '西宁', pinyin: 'xining', pinyinShort: 'xn', province: '青海' },
  { name: '格尔木', pinyin: 'geermu', pinyinShort: 'gem', province: '青海' },

  // 宁夏回族自治区
  { name: '银川', pinyin: 'yinchuan', pinyinShort: 'yc', province: '宁夏' },
  { name: '中卫', pinyin: 'zhongwei', pinyinShort: 'zw', province: '宁夏' },

  // 新疆维吾尔自治区
  { name: '乌鲁木齐', pinyin: 'wulumuqi', pinyinShort: 'wlmq', province: '新疆' },
  { name: '喀什', pinyin: 'kashi', pinyinShort: 'ks', province: '新疆' },
  { name: '伊宁', pinyin: 'yining', pinyinShort: 'yn', province: '新疆' },
  { name: '吐鲁番', pinyin: 'tulufan', pinyinShort: 'tlf', province: '新疆' },

  // 西藏自治区
  { name: '拉萨', pinyin: 'lasa', pinyinShort: 'ls', province: '西藏' },
  { name: '林芝', pinyin: 'linzhi', pinyinShort: 'lz', province: '西藏' },
  { name: '日喀则', pinyin: 'rikaze', pinyinShort: 'rkz', province: '西藏' },

  // 山东省（补充）
  { name: '曲阜', pinyin: 'qufu', pinyinShort: 'qf', province: '山东' },
  { name: '蓬莱', pinyin: 'penglai', pinyinShort: 'pl', province: '山东' },

  // 江苏省（补充）
  { name: '常熟', pinyin: 'changshu', pinyinShort: 'cs', province: '江苏' },
  { name: '昆山', pinyin: 'kunshan', pinyinShort: 'ks', province: '江苏' }
]
