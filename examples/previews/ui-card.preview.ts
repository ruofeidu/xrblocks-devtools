export default function preview({xb}) {
  return new xb.UICard({
    size: {width: 0.62, height: 0.36},
    style: {
      padding: 28,
      gap: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#151922',
      borderColor: '#6aa8ff',
      borderWidth: 2,
      borderRadius: 24,
    },
    children: [
      new xb.UIText({
        text: 'XR Blocks',
        style: {fontSize: 42, color: 'white', fontWeight: 'bold'},
      }),
      new xb.UIText({
        text: 'XR Blocks UI preview',
        style: {fontSize: 24, color: '#b8c7e6'},
      }),
    ],
  });
}
