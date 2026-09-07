#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^MYSAExtensionHandler)(void);

FOUNDATION_EXPORT NSString *MYSAVersion(void);
FOUNDATION_EXPORT NSArray<NSString *> *MYSAGetCachedReplies(void);
FOUNDATION_EXPORT void MYSASetExternalContext(NSString *contact, NSArray<NSString *> *context);
FOUNDATION_EXPORT void MYSAInvalidateReplies(void);
FOUNDATION_EXPORT void MYSARequestRefresh(void);
FOUNDATION_EXPORT void MYSARegisterExtension(NSString *identifier, NSString *title, MYSAExtensionHandler handler);
FOUNDATION_EXPORT NSArray<NSDictionary *> *MYSARegisteredExtensions(void);
FOUNDATION_EXPORT BOOL MYSAInvokeExtension(NSString *identifier);

NS_ASSUME_NONNULL_END
