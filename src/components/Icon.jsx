// Иконки Font Awesome (бесплатный набор, подключён в index.html).
//   <Icon name="user" />             → fa-solid fa-user
//   <Icon name="telegram" brand />   → fa-brands fa-telegram
//   gap — небольшой отступ справа, когда иконка стоит перед текстом вне flex-контейнера
export default function Icon({ name, brand = false, gap = false, className = '', ...rest }) {
  const cls = [brand ? 'fa-brands' : 'fa-solid', `fa-${name}`, gap ? 'ico--gap' : '', className].filter(Boolean).join(' ');
  return <i className={cls} aria-hidden="true" {...rest} />;
}
